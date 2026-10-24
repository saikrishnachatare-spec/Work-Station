-- Open-bug fixes from the 2026-10-24 full review (user approved "Fix all").
-- 1. Group membership: only group admins/creator can add other people
--    (self-join and invite-token join are unchanged).
-- 2. Server-side length caps: messages, posts, jobs, resources; error_logs
--    are truncated instead of rejected.
-- 3. Basic DB-side rate limiting on message/post/comment creation and on
--    error_logs inserts (per user when signed in, global budget for guests).
-- 4. Suspended members can no longer comment; post authors can no longer
--    flip kind/pinned or move authorship through editing (admins can).
--    Also merges messages_block_guard into messages_insert: as a separate
--    permissive policy it OR'ed around the membership/sender checks and let
--    any signed-in user insert into any thread as anyone when no block existed.

-- ---------- 1. group membership ----------
drop policy if exists members_insert_by_member on public.group_members;
create policy members_insert_by_group_admin on public.group_members for insert to authenticated
  with check (
    public.is_group_admin(group_id)
    and user_id <> auth.uid()
    and role = 'member'
    and exists (select 1 from public.profiles p where p.id = user_id and p.status = 'active')
  );

-- ---------- 2. length caps ----------
alter table public.messages drop constraint if exists messages_body_len;
alter table public.messages add constraint messages_body_len check (char_length(body) between 1 and 4000);

alter table public.posts drop constraint if exists posts_body_len;
alter table public.posts add constraint posts_body_len check (char_length(body) between 1 and 5000);

alter table public.jobs drop constraint if exists jobs_text_len;
alter table public.jobs add constraint jobs_text_len check (
  char_length(description) <= 5000 and char_length(role) <= 200 and char_length(firm) <= 200
);

alter table public.resources drop constraint if exists resources_text_len;
alter table public.resources add constraint resources_text_len check (
  char_length(title) <= 300 and char_length(meta) <= 500
);

create or replace function public.error_logs_sanitize()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.message := left(coalesce(new.message, ''), 2000);
  new.stack := left(new.stack, 8000);
  new.url := left(new.url, 1000);
  new.user_agent := left(new.user_agent, 500);
  return new;
end $$;

drop trigger if exists error_logs_sanitize on public.error_logs;
create trigger error_logs_sanitize before insert on public.error_logs
  for each row execute function public.error_logs_sanitize();

-- ---------- 3. rate limiting ----------
-- signed-in members: 30 messages / minute
create or replace function public.message_rate_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 30 from public.messages
   where sender_id = auth.uid() and created_at > now() - interval '1 minute';
$$;

-- signed-in members: 10 posts / hour
create or replace function public.post_rate_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 10 from public.posts
   where author_id = auth.uid() and created_at > now() - interval '1 hour';
$$;

-- signed-in members: 20 comments / 10 minutes
create or replace function public.comment_rate_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 20 from public.comments
   where author_id = auth.uid() and created_at > now() - interval '10 minutes';
$$;

-- error reports: signed-in 10 / minute each; guests share a 30 / minute budget
create or replace function public.error_log_rate_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null
    then count(*) filter (where user_id = auth.uid()) < 10
    else count(*) filter (where user_id is null) < 30
  end from public.error_logs where created_at > now() - interval '1 minute';
$$;

grant execute on function public.message_rate_ok() to authenticated;
grant execute on function public.post_rate_ok() to authenticated;
grant execute on function public.comment_rate_ok() to authenticated;
grant execute on function public.error_log_rate_ok() to authenticated, anon;

drop policy if exists messages_insert on public.messages;
drop policy if exists messages_block_guard on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and (public.is_thread_member(thread_id) or public.is_group_thread_member(thread_id))
    and not exists (
      select 1 from public.thread_participants p
      where p.thread_id = messages.thread_id and public.has_block_between(auth.uid(), p.user_id)
    )
    and public.message_rate_ok()
  );

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (
    auth.uid() = author_id
    and public.is_active_member()
    and (kind = 'post' or public.is_admin())
    and public.post_rate_ok()
  );

drop policy if exists errors_insert on public.error_logs;
create policy errors_insert on public.error_logs for insert
  with check (public.error_log_rate_ok());

-- ---------- 4. comments active-member check + post flag guard ----------
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (auth.uid() = author_id and public.is_active_member() and public.comment_rate_ok());

create or replace function public.posts_guard_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.kind is distinct from old.kind then raise exception 'cannot_change_kind'; end if;
    if new.pinned is distinct from old.pinned then raise exception 'cannot_change_pinned'; end if;
    if new.author_id is distinct from old.author_id then raise exception 'cannot_change_author'; end if;
  end if;
  return new;
end $$;

drop trigger if exists posts_guard_flags on public.posts;
create trigger posts_guard_flags before update on public.posts
  for each row execute function public.posts_guard_flags();
