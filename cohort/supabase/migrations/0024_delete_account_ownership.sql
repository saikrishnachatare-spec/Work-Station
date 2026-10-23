-- Ownership-safe account deletion:
--  * job openings posted by the deleted account close (applications cascade)
--  * groups the account created pass to the earliest remaining member, or are
--    removed when empty (threads/messages cascade)
--  * the client removes the avatar file via the Storage API before calling
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

  -- shared content stays, attribution anonymised
  update posts set author_name = 'Former member' where author_id = uid;
  update resources set uploaded_by = 'Former member' where owner_id = uid;

  -- close the account's own openings (applications on them cascade)
  delete from jobs where posted_by = uid;

  -- remove the account's own participation rows
  delete from group_members where user_id = uid;
  delete from thread_participants where user_id = uid;
  delete from group_invites where created_by = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from content_reports where reporter_id = uid;
  delete from applications where user_id = uid;
  delete from job_alert_prefs where user_id = uid;

  -- groups created by the account: hand over or remove when empty
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
         status = 'deleted'
   where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
