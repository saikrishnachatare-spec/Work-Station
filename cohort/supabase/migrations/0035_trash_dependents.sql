-- Trash keeps dependent records: jobs keep their applications, posts keep
-- comments and likes, resources keep storage bytes until purge.
create or replace function public.admin_trash(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  deps jsonb := '{}'::jsonb;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  if p_table not in ('posts','jobs','resources') then
    raise exception 'unsupported_table';
  end if;
  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into row_data using p_id;
  if row_data is null then
    raise exception 'not_found';
  end if;
  if p_table = 'jobs' then
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into deps from applications a where a.job_id = p_id;
    row_data := jsonb_set(row_data, '{_applications}', deps);
    delete from jobs where id = p_id;
  elsif p_table = 'posts' then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into deps from comments c where c.post_id = p_id;
    row_data := jsonb_set(row_data, '{_comments}', deps);
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into deps from post_likes l where l.post_id = p_id;
    row_data := jsonb_set(row_data, '{_likes}', deps);
    delete from posts where id = p_id;
  else
    delete from resources where id = p_id;
  end if;
  insert into trash (entity_table, entity_id, payload, trashed_by, trashed_by_name)
  values (p_table, p_id, row_data, auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), ''));
  insert into activity_log (actor_id, actor_name, action, entity_type, entity_id, detail)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), ''),
          p_table || '_trashed', p_table, p_id,
          jsonb_build_object('title', coalesce(row_data->>'title', row_data->>'role', left(coalesce(row_data->>'body',''), 80))));
end;
$$;

create or replace function public.admin_restore(p_trash_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  payload jsonb;
  d jsonb;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  select * into t from trash where id = p_trash_id and restored_at is null;
  if t.id is null then
    raise exception 'not_found';
  end if;
  payload := t.payload - '_applications' - '_comments' - '_likes';
  execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', t.entity_table, t.entity_table) using payload;
  if t.entity_table = 'jobs' then
    for d in select * from jsonb_array_elements(coalesce(t.payload->'_applications', '[]'::jsonb)) loop
      insert into applications select * from jsonb_populate_record(null::applications, d)
      on conflict (id) do nothing;
    end loop;
  elsif t.entity_table = 'posts' then
    for d in select * from jsonb_array_elements(coalesce(t.payload->'_comments', '[]'::jsonb)) loop
      insert into comments select * from jsonb_populate_record(null::comments, d)
      on conflict (id) do nothing;
    end loop;
    for d in select * from jsonb_array_elements(coalesce(t.payload->'_likes', '[]'::jsonb)) loop
      insert into post_likes select * from jsonb_populate_record(null::post_likes, d)
      on conflict (id) do nothing;
    end loop;
  end if;
  update trash set restored_at = now() where id = t.id;
  insert into activity_log (actor_id, actor_name, action, entity_type, entity_id, detail)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), ''),
          t.entity_table || '_restored', t.entity_table, t.entity_id,
          jsonb_build_object('title', coalesce(t.payload->>'title', t.payload->>'role', left(coalesce(t.payload->>'body',''), 80))));
end;
$$;

create or replace function public.admin_purge(p_trash_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  t record;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  select * into t from trash where id = p_trash_id;
  if t.id is null then
    raise exception 'not_found';
  end if;
  -- fail-closed: stored bytes must be removed through the Storage API first
  -- (direct storage.objects deletion is blocked; admins can use the Storage
  -- API thanks to the resource_files_delete policy widened below)
  if t.entity_table = 'resources' and length(coalesce(t.payload->>'file_path','')) > 0
     and exists (select 1 from storage.objects where bucket_id = 'resources' and name = t.payload->>'file_path') then
    raise exception 'storage_cleanup_required';
  end if;
  delete from trash where id = t.id;
  insert into activity_log (actor_id, actor_name, action, entity_type, entity_id, detail)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), ''),
          t.entity_table || '_purged', t.entity_table, t.entity_id,
          jsonb_build_object('title', coalesce(t.payload->>'title', t.payload->>'role', left(coalesce(t.payload->>'body',''), 80))));
end;
$$;

revoke all on function public.admin_trash(text, uuid) from public;
grant execute on function public.admin_trash(text, uuid) to authenticated;
revoke all on function public.admin_restore(uuid) from public;
grant execute on function public.admin_restore(uuid) to authenticated;
revoke all on function public.admin_purge(uuid) from public;
grant execute on function public.admin_purge(uuid) to authenticated;

-- Deletion also anonymises rows where the member is the target, and trash
-- moderation metadata carrying their name.
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

  -- audit history stays, identity does not: actor rows, target rows, and any
  -- detail field or trash metadata that names the deleted member
  update activity_log set actor_name = '', detail = '{}'::jsonb where actor_id = uid;
  update activity_log
     set detail = jsonb_set(detail, '{member}', '"Former member"')
   where detail ? 'member' and detail->>'member' = coalesce(old_name, '');
  update trash set trashed_by_name = 'Former member' where trashed_by = uid;
  update trash set payload = jsonb_set(payload, '{author_name}', '"Former member"')
   where entity_table = 'posts' and payload->>'author_id' = uid::text;
  update trash set payload = jsonb_set(payload, '{uploaded_by}', '"Former member"')
   where entity_table = 'resources' and payload->>'owner_id' = uid::text;

  delete from jobs where posted_by = uid;

  delete from group_members where user_id = uid;
  delete from thread_participants where user_id = uid;
  delete from group_invites where created_by = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from content_reports where reporter_id = uid;
  delete from applications where user_id = uid;
  delete from job_alert_prefs where user_id = uid;

  for g in select id from groups where created_by = uid loop
    select user_id into new_owner
      from group_members
     where group_id = g.id
     order by created_at asc
     limit 1;
    if new_owner is null then
      delete from groups where id = g.id;
    else
      update groups set created_by = new_owner where id = g.id;
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

-- admins can remove stored files through the Storage API (needed for purge)
drop policy if exists resource_files_delete on storage.objects;
create policy resource_files_delete on storage.objects for delete to public
  using (bucket_id = 'resources' and ((storage.foldername(name))[1] = (auth.uid())::text or is_admin()));
