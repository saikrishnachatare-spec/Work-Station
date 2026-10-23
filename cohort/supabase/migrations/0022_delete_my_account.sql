-- Self-service account deletion (approved rule: remove account and profile,
-- keep shared posts, messages and resources under "Former member").
-- Shared content keeps working: groups, threads, jobs and resources keep
-- their rows; identity on denormalised names is anonymised and the profile
-- row stays as an anonymised shell so joins still resolve.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Anonymise identity carried inside shared content.
  update posts set author_name = 'Former member' where author_id = uid;
  update resources set uploaded_by = 'Former member' where owner_id = uid;

  -- Personal associations and personal data.
  delete from group_members where user_id = uid;
  delete from thread_participants where user_id = uid;
  delete from group_invites where created_by = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from content_reports where reporter_id = uid;
  delete from applications where user_id = uid;
  delete from job_alert_prefs where user_id = uid;

  -- Anonymised profile shell (joins for posts/comments/messages/jobs resolve
  -- to "Former member" instead of erroring or showing stale identity).
  update profiles
     set full_name = 'Former member',
         course = null,
         level = null,
         avatar_path = null,
         role = 'user',
         status = 'deleted'
   where id = uid;

  -- Login removed; auth sessions/identities cascade.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
