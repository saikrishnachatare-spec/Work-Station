-- Read state: each participant's last-read timestamp powers unread counts.
alter table public.thread_participants add column if not exists last_read_at timestamptz not null default now();

-- Mark the caller's own participation as read. Definer so the update touches only the caller's row.
create or replace function public.mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.thread_participants
  set last_read_at = now()
  where thread_id = p_thread and user_id = auth.uid();
  if not found then
    raise exception 'not_a_participant';
  end if;
end;
$$;
revoke all on function public.mark_thread_read(uuid) from public;
grant execute on function public.mark_thread_read(uuid) to authenticated;
