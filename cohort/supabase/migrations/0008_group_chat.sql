-- Group chat (one thread per group), member-added-by-member, and shareable invite links.

-- A thread can belong to a group: that thread is the group's chat.
alter table public.threads
  add column if not exists group_id uuid references public.groups(id) on delete cascade;
create unique index if not exists threads_group_unique
  on public.threads (group_id) where group_id is not null;

-- Definer helpers (avoid RLS self-recursion on group_members / thread_participants)
create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_thread_member(p_thread_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.threads t
    join public.group_members gm on gm.group_id = t.group_id
    where t.id = p_thread_id and gm.user_id = auth.uid()
  );
$$;

-- Creating a thread: plain DM threads stay open to signed-in users;
-- a group thread can only be created by a member of that group.
drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads for insert
  with check (auth.uid() is not null and (group_id is null or public.is_group_member(group_id)));

-- Messages: DM participants OR members of the group that owns the thread.
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select
  using (public.is_thread_member(thread_id) or public.is_group_thread_member(thread_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (public.is_thread_member(thread_id) or public.is_group_thread_member(thread_id))
  );

-- Members can add other people to their group (WhatsApp default); self-join stays as is.
create policy members_insert_by_member on public.group_members for insert
  with check (public.is_group_member(group_id));

-- Shareable invite links. Rows are readable only by group members;
-- resolving/joining by token goes through definer functions so the token is the capability.
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.group_invites enable row level security;
create policy invites_read on public.group_invites for select
  using (public.is_group_member(group_id));
create policy invites_insert on public.group_invites for insert
  with check (auth.uid() = created_by and public.is_group_member(group_id));

-- Public preview for a link holder: group basics only, no member data.
create or replace function public.group_by_invite_token(p_token text)
returns table(group_id uuid, name text, purpose text, member_count integer)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.purpose, g.member_count
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token;
$$;

-- Join via link: validates the token and adds the caller as a member.
create or replace function public.join_group_by_token(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select i.group_id into v_group from public.group_invites i where i.token = p_token;
  if v_group is null then
    raise exception 'invalid_invite';
  end if;
  insert into public.group_members (group_id, user_id)
  values (v_group, auth.uid())
  on conflict do nothing;
  return v_group;
end;
$$;
