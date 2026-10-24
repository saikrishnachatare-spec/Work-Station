-- Private DM isolation (user-approved fix 2026-10-24).
-- Problem: thread_participants INSERT only required an active member, so anyone could add
-- themselves to any thread; threads SELECT was `true` (readable by anon).
-- Fix: DMs are created only through start_dm(); direct inserts into
-- thread_participants are removed; threads are visible only to participants,
-- group members (group threads) and admins; group threads can only be created by group members.

create or replace function public.start_dm(p_other uuid, p_first text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_thread uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member() then raise exception 'account_suspended'; end if;
  if p_other is null or p_other = v_me then raise exception 'invalid_recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then raise exception 'recipient_unavailable'; end if;
  if public.has_block_between(v_me, p_other) then raise exception 'blocked'; end if;
  if coalesce(btrim(p_first), '') = '' then raise exception 'empty_message'; end if;
  -- reuse an existing 1:1 thread
  select t.id into v_thread from public.threads t
   where t.group_id is null
     and exists (select 1 from public.thread_participants a where a.thread_id = t.id and a.user_id = v_me)
     and exists (select 1 from public.thread_participants b where b.thread_id = t.id and b.user_id = p_other)
     and (select count(*) from public.thread_participants c where c.thread_id = t.id) = 2
   limit 1;
  if v_thread is null then
    insert into public.threads default values returning id into v_thread;
    insert into public.thread_participants(thread_id, user_id) values (v_thread, v_me), (v_thread, p_other);
  end if;
  insert into public.messages(thread_id, sender_id, body) values (v_thread, v_me, p_first);
  return v_thread;
end $$;
revoke all on function public.start_dm(uuid, text) from public, anon;
grant execute on function public.start_dm(uuid, text) to authenticated;

drop policy if exists participants_insert on public.thread_participants;   -- no direct client inserts

drop policy if exists threads_read on public.threads;
create policy threads_read on public.threads for select to authenticated
  using (public.is_thread_member(id) or (group_id is not null and public.is_group_member(group_id)) or public.is_admin());

drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads for insert to authenticated
  with check (group_id is not null and public.is_group_member(group_id) and public.is_active_member());
