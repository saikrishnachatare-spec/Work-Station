-- 0037: admin analytics (usage aggregates + lightweight screen instrumentation)
-- Privacy: screen views are recorded for signed-in members only, screen names
-- only (no params, ids, or content), deduped to one row per member per screen
-- per 30 minutes. Rows live in activity_log, readable by admins only, and are
-- anonymised by delete_my_account like every other actor row.

-- Member-facing screen counter. Never raises: tracking must not break the app.
create or replace function public.log_screen_view(p_screen text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_screen text := left(coalesce(p_screen, ''), 60);
begin
  if v_uid is null then return; end if;
  if v_screen = '' or v_screen !~ '^[a-z0-9/():_-]+$' then return; end if;
  if exists (
    select 1 from activity_log
    where actor_id = v_uid and action = 'screen_view' and entity_id = v_screen
      and created_at > now() - interval '30 minutes'
  ) then return; end if;
  insert into activity_log (actor_id, actor_name, action, entity_type, entity_id, detail)
  values (v_uid, (select full_name from profiles where id = v_uid), 'screen_view', 'screen', v_screen, '{}');
exception when others then
  return;
end;
$$;

revoke all on function public.log_screen_view(text) from public, anon;
grant execute on function public.log_screen_view(text) to authenticated;

-- Admin-only aggregate snapshot. Everything is computed from real rows at call
-- time; nothing is backfilled or estimated.
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_screen_start timestamptz;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;

  select min(created_at) into v_screen_start from activity_log where action = 'screen_view';

  with days as (
    select generate_series((current_date - 13)::timestamptz, now(), interval '1 day')::date as day
  ),
  signins as (
    select created_at::date as day, count(*) as n from activity_log
    where action = 'sign_in' and created_at >= current_date - 13 group by 1
  ),
  joins as (
    select created_at::date as day, count(*) as n from profiles
    where created_at >= current_date - 13 group by 1
  ),
  screens as (
    select entity_id as screen, count(*) as views, count(distinct actor_id) as members
    from activity_log where action = 'screen_view' group by 1 order by 2 desc limit 15
  ),
  per_job as (
    select j.id, j.role, j.firm, j.status, count(a.id) as applications,
      count(*) filter (where a.status = 'shortlisted') as shortlisted,
      count(*) filter (where a.status = 'declined') as declined,
      count(*) filter (where a.status = 'reviewed') as reviewed
    from jobs j left join applications a on a.job_id = j.id
    group by j.id order by applications desc, j.created_at desc limit 20
  ),
  top_posts as (
    select p.id, left(p.body, 60) as excerpt, p.author_name, p.like_count, p.comment_count
    from posts p order by (p.like_count + p.comment_count) desc, p.created_at desc limit 10
  ),
  groups_by_size as (
    select g.id, g.name, g.member_count,
      (select count(*) from threads t where t.group_id = g.id) as threads,
      (select count(*) from messages m join threads t on t.id = m.thread_id where t.group_id = g.id) as messages
    from groups g order by g.member_count desc limit 20
  ),
  active_members as (
    select actor_id, coalesce(nullif(max(actor_name), ''), 'Former member') as name, count(*) as events, max(created_at) as last_active
    from activity_log where actor_id is not null and created_at >= now() - interval '30 days'
      and actor_name <> 'Former member'
    group by actor_id order by events desc limit 20
  )
  select jsonb_build_object(
    'generated_at', now(),
    'log_since', (select min(created_at) from activity_log),
    'screen_tracking_since', v_screen_start,
    'totals', jsonb_build_object(
      'members', (select count(*) from profiles where status <> 'deleted'),
      'suspended', (select count(*) from profiles where status = 'suspended'),
      'verified', (select count(*) from profiles where verified_at is not null and status <> 'deleted'),
      'posts', (select count(*) from posts),
      'jobs_open', (select count(*) from jobs where status = 'open'),
      'jobs_closed', (select count(*) from jobs where status = 'closed'),
      'applications', (select count(*) from applications),
      'resources', (select count(*) from resources),
      'groups', (select count(*) from groups),
      'messages', (select count(*) from messages)
    ),
    'active_members', jsonb_build_object(
      'signin_7d', (select count(distinct actor_id) from activity_log where action = 'sign_in' and created_at >= now() - interval '7 days'),
      'signin_30d', (select count(distinct actor_id) from activity_log where action = 'sign_in' and created_at >= now() - interval '30 days')
    ),
    'funnel', jsonb_build_object(
      'sent', (select count(*) from applications),
      'reviewed', (select count(*) from applications where status in ('reviewed','shortlisted','declined')),
      'shortlisted', (select count(*) from applications where status = 'shortlisted'),
      'declined', (select count(*) from applications where status = 'declined'),
      'pending', (select count(*) from applications where status = 'pending')
    ),
    'by_day', (select jsonb_agg(jsonb_build_object(
      'day', d.day,
      'signins', coalesce(s.n, 0),
      'new_members', coalesce(jn.n, 0)
    ) order by d.day) from days d left join signins s on s.day = d.day left join joins jn on jn.day = d.day),
    'screens', coalesce((select jsonb_agg(to_jsonb(screens)) from screens), '[]'),
    'per_job', coalesce((select jsonb_agg(to_jsonb(per_job)) from per_job), '[]'),
    'top_posts', coalesce((select jsonb_agg(to_jsonb(top_posts)) from top_posts), '[]'),
    'groups_by_size', coalesce((select jsonb_agg(to_jsonb(groups_by_size)) from groups_by_size), '[]'),
    'most_active', coalesce((select jsonb_agg(to_jsonb(active_members)) from active_members), '[]')
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated;
