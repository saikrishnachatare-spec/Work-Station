-- 0057: account deletion also purges resume files (client removes them first,
-- same guard pattern as avatars), and removes the member's connections and
-- notifications (tables added after the original delete flow).

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  if exists (
    select 1 from storage.objects
    where bucket_id = 'resumes' and (storage.foldername(name))[1] = uid::text
  ) then
    raise exception 'resume_cleanup_required';
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
  delete from connections where requester_id = uid or addressee_id = uid;
  delete from notifications where user_id = uid;

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

  -- Private contact details go with the account (phone is personal data).
  delete from profile_contacts where user_id = uid;

  delete from auth.users where id = uid;
end;
$function$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
