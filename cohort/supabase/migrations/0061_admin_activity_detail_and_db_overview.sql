-- 0061: precise activity-log detail + a redacted, admin-only database overview.
--
-- 1) log_content_activity now records the exact target of every action
--    (post excerpt, opening role/firm, applicant + opening, group + member)
--    so the admin Activity tab can say exactly what each member did.
--    Behavior is unchanged apart from the added `detail` payload.
--
-- 2) admin_db_overview() / admin_db_recent(p_table): server-side admin-only
--    read-only views over the database. The recent-rows view is a fixed
--    whitelist of tables and safe columns: no auth schema, no password
--    hashes or tokens, no phone/contact data, no message bodies.

create or replace function public.log_content_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_table_name = 'posts' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    values (new.author_id, coalesce(new.author_name,''), 'post_created', 'posts', new.id::text,
            jsonb_build_object('excerpt', left(coalesce(new.body,''), 120), 'kind', coalesce(new.kind,'post')));
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
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    select new.user_id, public.actor_display_name(new.user_id), 'application_sent', 'applications', new.id::text,
           jsonb_build_object('role', j.role, 'firm', j.firm, 'applicant', public.actor_display_name(new.user_id))
    from public.jobs j where j.id = new.job_id;
  elsif tg_table_name = 'applications' and tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
      select auth.uid(), public.actor_display_name(auth.uid()), 'application_'||new.status, 'applications', new.id::text,
             jsonb_build_object('role', j.role, 'firm', j.firm, 'applicant', public.actor_display_name(new.user_id))
      from public.jobs j where j.id = new.job_id;
    end if;
  elsif tg_table_name = 'group_members' and tg_op = 'INSERT' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    select new.user_id, public.actor_display_name(new.user_id), 'member_added', 'group_members', new.group_id::text,
           jsonb_build_object('member', public.actor_display_name(new.user_id), 'group', g.name)
    from public.groups g where g.id = new.group_id;
  elsif tg_table_name = 'group_members' and tg_op = 'DELETE' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
    select coalesce(auth.uid(), old.user_id), public.actor_display_name(coalesce(auth.uid(), old.user_id)),
           case when auth.uid() = old.user_id or auth.uid() is null then 'member_left' else 'member_removed' end,
           'group_members', old.group_id::text,
           jsonb_build_object('member', public.actor_display_name(old.user_id), 'group', g.name)
    from public.groups g where g.id = old.group_id;
    return old;
  end if;
  return new;
end
$function$;

-- Exact row counts per public table. Admin-only.
create or replace function public.admin_db_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  t text;
  n bigint;
  v jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    execute format('select count(*) from public.%I', t) into n;
    v := v || jsonb_build_object('table', t, 'rows', n);
  end loop;
  return v;
end
$function$;

-- Recent rows for a fixed whitelist of tables, safe columns only.
-- Never exposes: auth schema, password hashes, tokens, phone/contact data,
-- private message bodies, resume file paths.
create or replace function public.admin_db_recent(p_table text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v jsonb;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  case p_table
    when 'profiles' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'full_name', full_name, 'role', role, 'status', status,
               'account_type', account_type, 'course', course, 'level', level, 'org_name', org_name,
               'verified', verified_at is not null, 'created_at', created_at) as r
        from public.profiles order by created_at desc limit 25) s;
    when 'posts' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'author_name', author_name, 'kind', kind,
               'excerpt', left(coalesce(body,''), 140), 'created_at', created_at) as r
        from public.posts order by created_at desc limit 25) s;
    when 'comments' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'post_id', post_id, 'author_name', public.actor_display_name(author_id),
               'excerpt', left(coalesce(body,''), 140), 'created_at', created_at) as r
        from public.comments order by created_at desc limit 25) s;
    when 'jobs' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'role', role, 'firm', firm, 'cat', cat, 'loc', loc,
               'pay', pay, 'status', status, 'created_at', created_at) as r
        from public.jobs order by created_at desc limit 25) s;
    when 'applications' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'job_id', job_id, 'user_id', user_id, 'status', status,
               'created_at', created_at) as r
        from public.applications order by created_at desc limit 25) s;
    when 'groups' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'name', name, 'purpose', purpose,
               'member_count', member_count, 'created_at', created_at) as r
        from public.groups order by created_at desc limit 25) s;
    when 'resources' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'title', title, 'course', course, 'subject', subject,
               'uploaded_by', uploaded_by, 'created_at', created_at) as r
        from public.resources order by created_at desc limit 25) s;
    when 'student_notes' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'title', title, 'subject', subject,
               'uploaded_by', uploader_name, 'created_at', created_at) as r
        from public.student_notes order by created_at desc limit 25) s;
    when 'activity_log' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'actor_name', actor_name, 'action', action,
               'entity_type', entity_type, 'detail', detail, 'created_at', created_at) as r
        from public.activity_log order by created_at desc limit 25) s;
    when 'error_logs' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'message', left(coalesce(message,''), 200),
               'url', url, 'created_at', created_at) as r
        from public.error_logs order by created_at desc limit 25) s;
    when 'connections' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'requester_id', requester_id, 'addressee_id', addressee_id,
               'status', status, 'created_at', created_at) as r
        from public.connections order by created_at desc limit 25) s;
    when 'communities' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'name', name, 'created_at', created_at) as r
        from public.communities order by created_at desc limit 25) s;
    when 'verification_requests' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'user_id', user_id, 'status', status,
               'created_at', created_at) as r
        from public.verification_requests order by created_at desc limit 25) s;
    when 'content_reports' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'target_type', target_type, 'reason', reason,
               'status', status, 'created_at', created_at) as r
        from public.content_reports order by created_at desc limit 25) s;
    when 'notifications' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'user_id', user_id, 'kind', kind, 'title', title,
               'read', read_at is not null, 'created_at', created_at) as r
        from public.notifications order by created_at desc limit 25) s;
    when 'trash' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v from (
        select jsonb_build_object('id', id, 'entity_table', entity_table,
               'trashed_at', trashed_at) as r
        from public.trash order by trashed_at desc limit 25) s;
    else
      raise exception 'table_not_available';
  end case;
  return v;
end
$function$;
