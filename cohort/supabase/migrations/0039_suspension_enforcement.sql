-- Close the two creation paths that bypassed suspension: sending messages
-- (messages_insert checked only thread membership) and joining a group by
-- invite token (join_group_by_token runs as security definer, so the
-- members_insert active-member policy never fired). Suspended members keep
-- read/browse access and can still edit or remove their own existing
-- content, matching the documented design.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and (public.is_thread_member(thread_id) or public.is_group_thread_member(thread_id))
  );

create or replace function public.join_group_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_active_member() then
    raise exception 'account_suspended';
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
