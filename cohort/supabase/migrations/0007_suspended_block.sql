-- Suspended members can browse but cannot create anything: every insert
-- policy now also requires an active profile. Admins are unaffected.
create or replace function public.is_active_member()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert
  with check (auth.uid() = author_id and public.is_active_member() and (kind = 'post' or public.is_admin()));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert
  with check (auth.uid() = created_by and public.is_active_member());

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert
  with check (auth.uid() = posted_by and public.is_active_member());

drop policy if exists resources_insert on public.resources;
create policy resources_insert on public.resources for insert
  with check (auth.uid() = owner_id and public.is_active_member());

drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes for insert
  with check (auth.uid() = user_id and public.is_active_member());

drop policy if exists members_insert on public.group_members;
create policy members_insert on public.group_members for insert
  with check (auth.uid() = user_id and public.is_active_member());

drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications for insert
  with check (auth.uid() = user_id and public.is_active_member());

drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads for insert
  with check (auth.uid() is not null and public.is_active_member());

drop policy if exists participants_insert on public.thread_participants;
create policy participants_insert on public.thread_participants for insert
  with check (auth.uid() is not null and public.is_active_member());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.is_active_member() and exists (
    select 1 from public.thread_participants p
    where p.thread_id = messages.thread_id and p.user_id = auth.uid()
  ));
