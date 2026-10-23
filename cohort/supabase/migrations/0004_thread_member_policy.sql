-- Let thread members see each other (self-join in RLS would recurse, so use a definer fn)
create or replace function public.is_thread_member(p_thread_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.thread_participants
    where thread_id = p_thread_id and user_id = auth.uid()
  );
$$;

drop policy if exists participants_read on public.thread_participants;
create policy participants_read on public.thread_participants for select
  using (user_id = auth.uid() or public.is_admin() or public.is_thread_member(thread_id));

-- threads rows carry no content (id + created_at only); messages/participants stay protected.
-- A restrictive threads_read breaks INSERT ... RETURNING (PostgREST select-after-insert),
-- because the row is not yet readable before participants exist.
drop policy if exists threads_read on public.threads;
create policy threads_read on public.threads for select using (true);
