-- Cohort initial schema: real data for feed, groups, jobs, resources, messages.
-- RLS everywhere: public read, authenticated write, owner/admin manage.

-- Profiles (id matches auth.users for real signups; FK kept loose so nothing breaks on user deletion)
create table if not exists public.profiles (
  id uuid primary key,
  full_name text not null default '',
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check that bypasses RLS (avoids recursive policy lookups)
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- Feed posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  author_name text not null,
  author_role text not null default '',
  kind text not null default 'post' check (kind in ('post','announcement','message')),
  body text not null,
  pinned boolean not null default false,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Keep posts.like_count honest
create or replace function public.bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end; $$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.bump_like_count();

-- Groups
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null default '',
  description text not null default '',
  member_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create or replace function public.bump_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  end if;
  return coalesce(new, old);
end; $$;

drop trigger if exists group_members_count on public.group_members;
create trigger group_members_count
  after insert or delete on public.group_members
  for each row execute function public.bump_member_count();

-- Jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  cat text not null default 'Jobs',
  firm text not null,
  role text not null,
  loc text not null default '',
  pay text not null default '',
  tags text[] not null default '{}',
  posted_by uuid,
  created_at timestamptz not null default now()
);

-- Resources
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  cat text not null default 'Notes',
  course text not null default '',
  title text not null,
  uploaded_by text not null default '',
  meta text not null default '',
  owner_id uuid,
  created_at timestamptz not null default now()
);

-- Direct messages
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.thread_participants (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null,
  primary key (thread_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.jobs enable row level security;
alter table public.resources enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;

-- profiles: anyone reads; you manage your own row; admins manage all
create policy profiles_read on public.profiles for select using (true);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);
create policy profiles_admin on public.profiles for all using (public.is_admin());

-- posts: public read; signed-in users post as themselves; owner/admin edit; only admins pin/announce
create policy posts_read on public.posts for select using (true);
create policy posts_insert on public.posts for insert
  with check (auth.uid() = author_id and (kind = 'post' or public.is_admin()));
create policy posts_update on public.posts for update
  using (auth.uid() = author_id or public.is_admin());
create policy posts_delete on public.posts for delete
  using (auth.uid() = author_id or public.is_admin());

create policy likes_read on public.post_likes for select using (true);
create policy likes_insert on public.post_likes for insert with check (auth.uid() = user_id);
create policy likes_delete on public.post_likes for delete using (auth.uid() = user_id);

-- groups: public read; signed-in users create and join/leave
create policy groups_read on public.groups for select using (true);
create policy groups_insert on public.groups for insert with check (auth.uid() = created_by);
create policy groups_update on public.groups for update
  using (auth.uid() = created_by or public.is_admin());
create policy groups_delete on public.groups for delete
  using (auth.uid() = created_by or public.is_admin());

create policy members_read on public.group_members for select using (true);
create policy members_insert on public.group_members for insert with check (auth.uid() = user_id);
create policy members_delete on public.group_members for delete using (auth.uid() = user_id or public.is_admin());

-- jobs: public read; signed-in users post openings; owner/admin manage
create policy jobs_read on public.jobs for select using (true);
create policy jobs_insert on public.jobs for insert with check (auth.uid() = posted_by);
create policy jobs_update on public.jobs for update using (auth.uid() = posted_by or public.is_admin());
create policy jobs_delete on public.jobs for delete using (auth.uid() = posted_by or public.is_admin());

-- resources: public read; signed-in users share; owner/admin manage
create policy resources_read on public.resources for select using (true);
create policy resources_insert on public.resources for insert with check (auth.uid() = owner_id);
create policy resources_update on public.resources for update using (auth.uid() = owner_id or public.is_admin());
create policy resources_delete on public.resources for delete using (auth.uid() = owner_id or public.is_admin());

-- messages: participants only
create policy threads_read on public.threads for select
  using (exists (select 1 from public.thread_participants p where p.thread_id = id and p.user_id = auth.uid()));
create policy threads_insert on public.threads for insert with check (auth.uid() is not null);
create policy participants_read on public.thread_participants for select
  using (user_id = auth.uid() or public.is_admin());
create policy participants_insert on public.thread_participants for insert with check (auth.uid() is not null);
create policy messages_read on public.messages for select
  using (exists (select 1 from public.thread_participants p where p.thread_id = messages.thread_id and p.user_id = auth.uid()));
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from public.thread_participants p where p.thread_id = messages.thread_id and p.user_id = auth.uid()));

-- Seed content (matches the demo data the app shipped with)
insert into public.posts (author_name, author_role, kind, pinned, body, like_count, comment_count, created_at) values
  ('Board of Studies', 'Official', 'announcement', true, 'Nov 2026 exam schedule for CA Final and CA Inter is out. Exam forms, dates and admit cards are linked in the ICAI module.', 312, 45, now() - interval '2 hours'),
  ('Ananya Reddy', 'CA Final', 'post', false, 'Cleared CA Inter Group 2 today! Uploading my FR and AFM notes to Resources. Happy to help anyone starting their prep.', 214, 38, now() - interval '1 hour'),
  ('Rohan Mehta', 'CMA Inter', 'post', false, 'Anyone writing CMA Inter this December from Hyderabad? Starting a weekend study group for Cost Accounting. Message me if you are in.', 56, 21, now() - interval '3 hours'),
  ('CA Priya Sharma', 'Mentor', 'message', false, 'Mentor broadcast: free Direct Tax revision marathon this Sunday at 10 AM. The session link is pinned in Resources under Videos.', 98, 12, now() - interval '5 hours'),
  ('Arjun Desai', 'CS Executive', 'post', false, 'Condensed the latest Company Law amendments into 4 pages for the December attempt. Uploaded to Resources, hope it helps.', 143, 17, now() - interval '8 hours');

insert into public.groups (name, purpose, description, member_count) values
  ('CA Final Nov 2026 exam form help', 'Exam form', 'Form dates, fee doubts and centre changes.', 1240),
  ('Hyderabad CMA Inter study circle', 'Study group', 'Weekend Cost Accounting sessions.', 86),
  ('Articleship seekers 2026', 'Professional', 'Share openings, firm reviews and interview tips.', 2310),
  ('CS Executive Company Law', 'Study group', 'Amendments, case laws and doubt threads.', 540),
  ('Practicing CAs and students', 'Professional', 'Ask practising CAs about real work.', 420),
  ('GST return season gigs', 'Professional', 'Gig work leads and filing tips.', 780);

insert into public.jobs (cat, firm, role, loc, pay, tags) values
  ('Articleship', 'Sen & Rao LLP', 'Articleship, statutory audit', 'Hyderabad', '₹8,000/month', array['Statutory audit','Tax audit']),
  ('Articleship', 'Mehta & Associates', 'Articleship, direct tax', 'Chennai', '₹7,500/month', array['Income tax','Appeals']),
  ('Industrial training', 'Amber Textiles Ltd', 'Industrial trainee, finance', 'Mumbai', '₹15,000/month', array['CA Final','9 months']),
  ('Gig work', 'Sunny & Co.', 'GST return season assistant', 'Remote', '₹6,000/month', array['3 months','GSTR-1 & 3B']),
  ('Jobs', 'VedaTax Advisors', 'Accounts executive, semi-qualified', 'Bengaluru', '₹4.2 LPA', array['CA Inter','Full-time']),
  ('Jobs', 'Deccan Pharma', 'Costing trainee', 'Hyderabad', '₹3.6 LPA', array['CMA Inter','Full-time']);

insert into public.resources (cat, course, title, uploaded_by, meta) values
  ('Notes', 'CA Final', 'Ind AS 115 quick revision notes', 'Ananya Reddy', 'PDF · 12 pages · 2.1k downloads'),
  ('Notes', 'CA Inter', 'Audit SA series mind maps', 'Kiran Kumar', 'PDF · 8 pages · 1.4k downloads'),
  ('Notes', 'CMA Inter', 'Cost Accounting formulas one-pager', 'Kavya Nair', 'PDF · 2 pages · 980 downloads'),
  ('Question papers', 'CA Inter', 'Nov 2025 papers with suggested answers', 'Cohort team', 'PDF · 6 papers · 3.3k downloads'),
  ('Videos', 'CS Executive', 'Company Law amendments, explained', 'CA Priya Sharma', 'Video · 45 min · 760 views'),
  ('RTP & MTP', 'CA Final', 'RTP compilation, Direct Tax', 'Cohort team', 'PDF · 2 attempts · 1.1k downloads');
