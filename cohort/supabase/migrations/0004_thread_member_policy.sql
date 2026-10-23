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
