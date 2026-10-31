-- Deep links: message notifications open the specific thread/group instead of
-- the bare /messages list.

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
        r.user_id, 'message', v_sender || ' sent you a message', new.body,
        '/messages?thread=' || new.thread_id,
        'msg:' || new.thread_id || ':' || r.user_id || ':' || v_hour);
    end loop;
  else
    for r in
      select gm.user_id from public.group_members gm
      where gm.group_id = v_group and gm.user_id is distinct from new.sender_id
    loop
      if public.has_block_between(new.sender_id, r.user_id) then continue; end if;
      perform public.enqueue_notification(
        r.user_id, 'message', v_sender || ' posted in a group you are in', new.body,
        '/group-chat?id=' || v_group,
        'msg:' || new.thread_id || ':' || r.user_id || ':' || v_hour);
    end loop;
  end if;
  return new;
end $$;
