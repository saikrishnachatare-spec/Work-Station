-- Group admins: the creator is a permanent admin; they can promote other
-- members to admin. Admins manage membership and group details. Succession
-- after account deletion prefers existing admins, then the longest-standing
-- member (approved by the user).
alter table group_members add column if not exists role text not null default 'member';
alter table group_members drop constraint if exists group_members_role_check;
alter table group_members add constraint group_members_role_check check (role in ('admin','member'));

update group_members gm set role = 'admin'
  from groups g
 where g.id = gm.group_id and g.created_by = gm.user_id;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from groups where id = gid and created_by = auth.uid())
      or exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'admin');
$$;

revoke all on function public.is_group_admin(uuid) from public;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- group admins (and the creator) can remove members, but never the creator
drop policy if exists members_delete_by_group_admin on public.group_members;
create policy members_delete_by_group_admin on public.group_members for delete to authenticated
  using (is_group_admin(group_id)
         and user_id <> auth.uid()
         and user_id <> (select created_by from groups where id = group_id));

-- group admins can promote/demote members, but never change the creator's row
drop policy if exists members_update_by_group_admin on public.group_members;
create policy members_update_by_group_admin on public.group_members for update to authenticated
  using (is_group_admin(group_id)
         and user_id <> (select created_by from groups where id = group_id))
  with check (is_group_admin(group_id)
         and user_id <> (select created_by from groups where id = group_id));

-- group admins can edit group details
drop policy if exists groups_update_by_group_admin on public.groups;
create policy groups_update_by_group_admin on public.groups for update to authenticated
  using (is_group_admin(id)) with check (is_group_admin(id));

-- log promotions/removals
create or replace function public.log_group_member_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role is distinct from new.role then
    insert into activity_log (actor_id, actor_name, action, entity_type, entity_id, detail)
    values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), ''),
            case when new.role = 'admin' then 'group_admin_granted' else 'group_admin_revoked' end,
            'group_members', new.user_id,
            jsonb_build_object('member', (select full_name from profiles where id = new.user_id),
                               'group', (select name from groups where id = new.group_id)));
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists group_members_admin_log on group_members;
create trigger group_members_admin_log after update on group_members
  for each row execute function public.log_group_member_admin();

-- succession prefers existing group admins, then the longest-standing member
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  old_name text;
  g record;
  new_owner uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'resources' and name like uid::text || '/avatar-%'
  ) then
    raise exception 'avatar_cleanup_required';
  end if;

  perform set_config('app.profile_admin_op', 'on', true);

  select full_name into old_name from profiles where id = uid;

  update posts set author_name = 'Former member' where author_id = uid;
  update resources set uploaded_by = 'Former member' where owner_id = uid;

  update activity_log set actor_name = '', detail = '{}'::jsonb where actor_id = uid;
  update activity_log
     set detail = jsonb_set(detail, '{member}', '"Former member"')
   where detail ? 'member' and detail->>'member' = coalesce(old_name, '');
  update trash set trashed_by_name = 'Former member' where trashed_by = uid;
  update trash set payload = jsonb_set(payload, '{author_name}', '"Former member"')
   where entity_table = 'posts' and payload->>'author_id' = uid::text;
  update trash set payload = jsonb_set(payload, '{uploaded_by}', '"Former member"')
   where entity_table = 'resources' and payload->>'owner_id' = uid::text;
  update trash set payload = jsonb_set(payload, '{firm}', '"Former member"')
   where entity_table = 'jobs' and payload->>'posted_by' = uid::text;
  update trash
     set payload = jsonb_set(payload, '{_applications}', coalesce((
       select jsonb_agg(a) from jsonb_array_elements(payload->'_applications') a
       where a->>'user_id' <> uid::text), '[]'::jsonb))
   where entity_table = 'jobs' and payload ? '_applications'
     and payload->>'_applications'::text like '%' || uid::text || '%';

  delete from jobs where posted_by = uid;

  delete from group_members where user_id = uid;
  delete from thread_participants where user_id = uid;
  delete from group_invites where created_by = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from content_reports where reporter_id = uid;
  delete from applications where user_id = uid;
  delete from job_alert_prefs where user_id = uid;

  for g in select id from groups where created_by = uid loop
    -- succession: an existing group admin first, then the longest-standing member
    select user_id into new_owner
      from group_members
     where group_id = g.id
     order by (role = 'admin') desc, created_at asc
     limit 1;
    if new_owner is null then
      delete from groups where id = g.id;
    else
      update groups set created_by = new_owner where id = g.id;
      update group_members set role = 'admin' where group_id = g.id and user_id = new_owner;
    end if;
  end loop;

  update profiles
     set full_name = 'Former member',
         course = '',
         level = '',
         avatar_path = null,
         role = 'user',
         status = 'deleted',
         verified_at = null
   where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- fix: the combined elsif condition 'applications UPDATE and new.status ...'
-- touched new.status for tables without that field and broke group member
-- inserts; nested if guards the field access
create or replace function public.log_content_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
  elsif tg_table_name = 'applications' and tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
      values (auth.uid(), public.actor_display_name(auth.uid()), 'application_'||new.status, 'applications', new.id::text);
    end if;
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
end
$function$;

-- close self-promotion: joining or adding members always lands as 'member'
-- (promotion happens only through the admin update path); only the creator
-- may join their own group directly as admin
drop policy if exists members_insert on public.group_members;
create policy members_insert on public.group_members for insert to public
  with check (auth.uid() = user_id and is_active_member()
    and (role = 'member' or (select created_by from groups where id = group_id) = auth.uid()));
drop policy if exists members_insert_by_member on public.group_members;
create policy members_insert_by_member on public.group_members for insert to public
  with check (is_group_member(group_id) and role = 'member');

-- member lists and chat history are for current members (+app admins) only;
-- removed or former members lose access
drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select to public
  using (is_group_member(group_id) or is_admin());
