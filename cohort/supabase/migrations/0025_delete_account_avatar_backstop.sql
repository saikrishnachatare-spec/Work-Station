-- Server-side backstop for avatar cleanup: even when the client-side Storage
-- API removal did not run (direct RPC callers, failed cleanup), the avatar
-- file's storage row is removed so the file becomes unreachable. The client
-- cleanup stays primary because it also removes the stored bytes.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  g record;
  new_owner uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  perform set_config('app.profile_admin_op', 'on', true);

  update posts set author_name = 'Former member' where author_id = uid;
  update resources set uploaded_by = 'Former member' where owner_id = uid;

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

  -- backstop: remove avatar object rows server-side (bypasses the storage
  -- protect_delete trigger via its own allow switch, transaction-local; removes the metadata
  -- row so the file is unreachable even if its bytes orphan)
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
   where bucket_id = 'resources'
     and name like uid::text || '/avatar-%';
  perform set_config('storage.allow_delete_query', 'false', true);

  update profiles
     set full_name = 'Former member',
         course = '',
         level = '',
         avatar_path = null,
         role = 'user',
         status = 'deleted'
   where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
