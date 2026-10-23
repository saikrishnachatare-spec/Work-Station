-- Admin expansion foundation: activity log + recoverable trash.
-- The log records real events only (no message bodies, no invented history).
-- Trash holds admin-moderated content recoverably; self-service account
-- deletion stays permanent and separate.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text not null default '',
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create policy activity_read_admin on public.activity_log for select to authenticated
  using (public.is_admin());

create table if not exists public.trash (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  payload jsonb not null,
  trashed_by uuid,
  trashed_by_name text not null default '',
  trashed_at timestamptz not null default now(),
  restored_at timestamptz
);
alter table public.trash enable row level security;
create policy trash_read_admin on public.trash for select to authenticated
  using (public.is_admin());

create or replace function public.actor_display_name(uid uuid)
returns text language sql stable security definer set search_path='public' as $$
  select coalesce((select full_name from public.profiles where id = uid), '')
$$;

-- signups / moderation-relevant profile changes
create or replace function public.log_profile_activity() returns trigger
language plpgsql security definer set search_path='public' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (new.id, coalesce(new.full_name,''), 'signup', 'profile', new.id::text,
            jsonb_build_object('account_type', new.account_type, 'org_name', new.org_name, 'course', new.course, 'level', new.level));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
      values (auth.uid(), public.actor_display_name(auth.uid()), 'admin_role_'||new.role, 'profile', new.id::text);
    end if;
    if new.verified_at is distinct from old.verified_at then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
      values (auth.uid(), public.actor_display_name(auth.uid()), case when new.verified_at is null then 'unverified' else 'verified' end,
              'profile', new.id::text, jsonb_build_object('member', new.full_name));
    end if;
    if new.status is distinct from old.status then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
      values (coalesce(auth.uid(), new.id), coalesce(public.actor_display_name(auth.uid()), new.full_name),
              'account_'||new.status, 'profile', new.id::text, jsonb_build_object('member', case when new.status='deleted' then '' else new.full_name end));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_log_activity on public.profiles;
create trigger profiles_log_activity after insert or update on public.profiles
  for each row execute function public.log_profile_activity();

-- sign-ins from real auth timestamps, and account deletion (no identity retained)
create or replace function public.log_auth_activity() returns trigger
language plpgsql security definer set search_path='public' as $$
begin
  if tg_op = 'UPDATE' and new.last_sign_in_at is distinct from old.last_sign_in_at then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (new.id, public.actor_display_name(new.id), 'sign_in', 'auth', new.id::text);
  elsif tg_op = 'DELETE' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (null, '', 'account_deleted', 'auth', old.id::text);
    return old;
  end if;
  return new;
end $$;
drop trigger if exists auth_users_log_activity on auth.users;
create trigger auth_users_log_activity after update or delete on auth.users
  for each row execute function public.log_auth_activity();

-- content lifecycle
create or replace function public.log_content_activity() returns trigger
language plpgsql security definer set search_path='public' as $$
begin
  if tg_table_name = 'posts' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (new.author_id, coalesce(new.author_name,''), 'post_created', 'posts', new.id::text);
  elsif tg_table_name = 'jobs' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (new.posted_by, public.actor_display_name(new.posted_by), 'opening_posted', 'jobs', new.id::text,
            jsonb_build_object('role', new.role, 'firm', new.firm, 'cat', new.cat));
  elsif tg_table_name = 'resources' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (new.owner_id, coalesce(new.uploaded_by,''), 'resource_shared', 'resources', new.id::text, jsonb_build_object('title', new.title));
  elsif tg_table_name = 'groups' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (new.created_by, public.actor_display_name(new.created_by), 'group_created', 'groups', new.id::text, jsonb_build_object('name', new.name));
  elsif tg_table_name = 'groups' and tg_op = 'DELETE' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (auth.uid(), public.actor_display_name(auth.uid()), 'group_removed', 'groups', old.id::text, jsonb_build_object('name', old.name));
    return old;
  elsif tg_table_name = 'applications' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (new.user_id, public.actor_display_name(new.user_id), 'application_sent', 'applications', new.id::text);
  elsif tg_table_name = 'applications' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (auth.uid(), public.actor_display_name(auth.uid()), 'application_'||new.status, 'applications', new.id::text);
  elsif tg_table_name = 'group_members' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (new.user_id, public.actor_display_name(new.user_id), 'member_added', 'group_members', new.group_id::text);
  elsif tg_table_name = 'group_members' and tg_op = 'DELETE' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (coalesce(auth.uid(), old.user_id), public.actor_display_name(coalesce(auth.uid(), old.user_id)),
            case when auth.uid() = old.user_id or auth.uid() is null then 'member_left' else 'member_removed' end,
            'group_members', old.group_id::text, jsonb_build_object('member', public.actor_display_name(old.user_id)));
    return old;
  end if;
  return new;
end $$;
drop trigger if exists posts_log on public.posts;
create trigger posts_log after insert on public.posts for each row execute function public.log_content_activity();
drop trigger if exists jobs_log on public.jobs;
create trigger jobs_log after insert on public.jobs for each row execute function public.log_content_activity();
drop trigger if exists resources_log on public.resources;
create trigger resources_log after insert on public.resources for each row execute function public.log_content_activity();
drop trigger if exists groups_log on public.groups;
create trigger groups_log after insert or delete on public.groups for each row execute function public.log_content_activity();
drop trigger if exists applications_log on public.applications;
create trigger applications_log after insert or update on public.applications for each row execute function public.log_content_activity();
drop trigger if exists group_members_log on public.group_members;
create trigger group_members_log after insert or delete on public.group_members for each row execute function public.log_content_activity();

-- trash: recoverable admin moderation for posts/jobs/resources
create or replace function public.admin_trash(p_table text, p_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare
  payload jsonb;
  admin_name text := public.actor_display_name(auth.uid());
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_table not in ('posts','jobs','resources') then raise exception 'unsupported_table'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table) into payload using p_id;
  if payload is null then raise exception 'not_found'; end if;
  insert into public.trash(entity_table, entity_id, payload, trashed_by, trashed_by_name)
  values (p_table, p_id, payload, auth.uid(), admin_name);
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
  values (auth.uid(), admin_name, p_table||'_trashed', p_table, p_id::text,
          jsonb_build_object('title', coalesce(payload->>'title', payload->>'role', left(coalesce(payload->>'body',''), 60))));
end $$;

create or replace function public.admin_restore(p_trash_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare
  t record;
  admin_name text := public.actor_display_name(auth.uid());
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into t from public.trash where id = p_trash_id and restored_at is null;
  if not found then raise exception 'not_found'; end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t.entity_table, t.entity_table)
  using t.payload;
  update public.trash set restored_at = now() where id = p_trash_id;
  insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
  values (auth.uid(), admin_name, t.entity_table||'_restored', t.entity_table, t.entity_id::text);
end $$;

create or replace function public.admin_purge(p_trash_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare
  t record;
  admin_name text := public.actor_display_name(auth.uid());
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into t from public.trash where id = p_trash_id;
  if not found then raise exception 'not_found'; end if;
  delete from public.trash where id = p_trash_id;
  insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
  values (auth.uid(), admin_name, t.entity_table||'_purged', t.entity_table, t.entity_id::text);
end $$;

revoke all on function public.admin_trash(text, uuid) from public;
revoke all on function public.admin_restore(uuid) from public;
revoke all on function public.admin_purge(uuid) from public;
grant execute on function public.admin_trash(text, uuid) to authenticated;
grant execute on function public.admin_restore(uuid) to authenticated;
grant execute on function public.admin_purge(uuid) to authenticated;
