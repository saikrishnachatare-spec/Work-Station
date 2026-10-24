-- Communities + channels (user feature request 2026-10-24).
-- A community bundles multiple groups in one place. A channel is a group with
-- kind='channel': members read, only group admins/creator post. Channel posts
-- stay inside the channel (no feed integration), per the user's decision.
-- Additive only: existing groups default to kind='group' and behave as before.

alter table public.groups add column if not exists kind text not null default 'group';
alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups add constraint groups_kind_check check (kind in ('group','channel'));

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  about text not null default '' check (char_length(about) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.community_groups (
  community_id uuid not null references public.communities(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, group_id)
);

alter table public.communities enable row level security;
alter table public.community_groups enable row level security;

-- communities are browsable like groups; creators and app admins manage them
create policy communities_read on public.communities for select using (true);
create policy communities_insert on public.communities for insert to authenticated
  with check (auth.uid() = created_by and public.is_active_member());
create policy communities_update on public.communities for update to authenticated
  using (auth.uid() = created_by or public.is_admin());
create policy communities_delete on public.communities for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());

create policy community_groups_read on public.community_groups for select using (true);
create policy community_groups_insert on public.community_groups for insert to authenticated
  with check (
    public.is_active_member()
    and exists (select 1 from public.communities c where c.id = community_id and (c.created_by = auth.uid() or public.is_admin()))
    and exists (select 1 from public.groups g where g.id = group_id and (g.created_by = auth.uid() or public.is_group_admin(g.id) or public.is_admin()))
  );
create policy community_groups_delete on public.community_groups for delete to authenticated
  using (
    exists (select 1 from public.communities c where c.id = community_id and (c.created_by = auth.uid() or public.is_admin()))
  );

-- helpers for the channel posting rule
create or replace function public.thread_group_id(p_thread uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.threads where id = p_thread;
$$;

create or replace function public.thread_group_kind(p_thread uuid)
returns text language sql stable security definer set search_path = public as $$
  select g.kind from public.threads t join public.groups g on g.id = t.group_id where t.id = p_thread;
$$;

grant execute on function public.thread_group_id(uuid) to authenticated;
grant execute on function public.thread_group_kind(uuid) to authenticated;

-- channels: only group admins/creator can post; plain groups unchanged
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and (
      public.is_thread_member(thread_id)
      or (
        public.is_group_thread_member(thread_id)
        and (
          coalesce(public.thread_group_kind(thread_id), 'group') = 'group'
          or public.is_group_admin(public.thread_group_id(thread_id))
        )
      )
    )
    and not exists (
      select 1 from public.thread_participants p
      where p.thread_id = messages.thread_id and public.has_block_between(auth.uid(), p.user_id)
    )
    and public.message_rate_ok()
  );
