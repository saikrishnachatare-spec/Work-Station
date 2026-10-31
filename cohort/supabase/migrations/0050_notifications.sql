-- 0050: in-app notifications. Triggers enqueue one row per recipient; the
-- app's notification center lists them and marks them read. Dedupe keys cap
-- message/comment notifications at one per recipient per thread/post per
-- hour so an active chat does not flood the list.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- recipient
  kind text not null check (kind in ('message', 'comment', 'application_status')),
  title text not null default '',
  body text not null default '',
  link text not null default '',
  dedupe_key text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_dedupe on public.notifications (dedupe_key) where dedupe_key <> '';

alter table public.notifications enable row level security;
-- Members see and mark-read their own rows only. Inserts come from
-- security-definer triggers (table owner), never from the client.
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.enqueue_notification(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user, p_kind, left(p_title, 140), left(p_body, 500), p_link, p_dedupe)
  on conflict (dedupe_key) where dedupe_key <> '' do nothing;
end $$;

-- New message: notify the other DM participant, or all group members.
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sender text;
  v_group uuid;
  r record;
  v_hour text := to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');
begin
  select coalesce(nullif(btrim(full_name), ''), 'Someone') into v_sender
  from public.profiles where id = new.sender_id;
  select group_id into v_group from public.threads where id = new.thread_id;
  if v_group is null then
    for r in
      select tp.user_id from public.thread_participants tp
      where tp.thread_id = new.thread_id and tp.user_id is distinct from new.sender_id
    loop
      if public.has_block_between(new.sender_id, r.user_id) then continue; end if;
      perform public.enqueue_notification(
        r.user_id, 'message', v_sender || ' sent you a message', new.body, '/messages',
        'msg:' || new.thread_id || ':' || r.user_id || ':' || v_hour);
    end loop;
  else
    for r in
      select gm.user_id from public.group_members gm
      where gm.group_id = v_group and gm.user_id is distinct from new.sender_id
    loop
      if public.has_block_between(new.sender_id, r.user_id) then continue; end if;
      perform public.enqueue_notification(
        r.user_id, 'message', v_sender || ' posted in a group you are in', new.body, '/messages',
        'msg:' || new.thread_id || ':' || r.user_id || ':' || v_hour);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_on_message();

-- New comment: notify the post author.
create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_commenter text;
begin
  select p.author_id into v_author from public.posts p where p.id = new.post_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select coalesce(nullif(btrim(full_name), ''), 'Someone') into v_commenter
  from public.profiles where id = new.author_id;
  perform public.enqueue_notification(
    v_author, 'comment', v_commenter || ' replied to your post', new.body, '/post?id=' || new.post_id,
    'cmt:' || new.post_id || ':' || v_author || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'));
  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

-- Application status change: notify the applicant.
create or replace function public.notify_on_application_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_firm text;
  v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select j.role, j.firm into v_role, v_firm from public.jobs j where j.id = new.job_id;
  v_label := case new.status
    when 'reviewed' then 'is being reviewed'
    when 'shortlisted' then '- you are shortlisted'
    when 'rejected' then 'was not selected'
    else 'was updated' end;
  perform public.enqueue_notification(
    new.user_id, 'application_status',
    'Application update: ' || coalesce(v_role, 'an opening'),
    'Your application to ' || coalesce(v_firm, 'a firm') || ' for ' || coalesce(v_role, 'an opening') || ' ' || v_label || '.',
    '/work',
    'app:' || new.id || ':' || new.status);
  return new;
end $$;

drop trigger if exists applications_notify on public.applications;
create trigger applications_notify after update of status on public.applications
  for each row execute function public.notify_on_application_status();
