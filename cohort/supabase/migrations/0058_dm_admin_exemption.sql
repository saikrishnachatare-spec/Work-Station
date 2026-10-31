-- 0058: anyone can message an admin (terms/privacy contact path), without
-- weakening the member-to-member connection gate.

create or replace function public.start_dm(p_other uuid, p_first text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_thread uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member() then raise exception 'account_suspended'; end if;
  if p_other is null or p_other = v_me then raise exception 'invalid_recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then raise exception 'recipient_unavailable'; end if;
  if public.has_block_between(v_me, p_other) then raise exception 'blocked'; end if;
  -- Gate: connections only. Exempt: admins either direction (support contact
  -- path), and firm/enterprise accounts messaging applicants directly.
  if not (
    public.is_admin()
    or public.are_connected(v_me, p_other)
    or exists (select 1 from public.profiles other where other.id = p_other and other.role = 'admin')
    or exists (
      select 1 from public.profiles me
      where me.id = v_me and me.account_type in ('firm', 'enterprise')
    )
  ) then
    raise exception 'Connect with this member first - only connections can message each other.';
  end if;
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
  -- A blank first message opens the conversation without sending anything;
  -- the member types the real opener themselves (no canned "Hi!").
  if coalesce(btrim(p_first), '') <> '' then
    insert into public.messages(thread_id, sender_id, body) values (v_thread, v_me, btrim(p_first));
  end if;
  return v_thread;
end $$;
