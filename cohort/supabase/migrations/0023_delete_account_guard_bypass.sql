-- Let delete_my_account (and only it) perform its anonymising profile write.
-- The privilege guard still blocks every ordinary role/status write; the
-- bypass is a transaction-local setting the definer function sets, and
-- PostgREST exposes no way for a client to set it directly.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.profile_admin_op', true), '') <> 'on' then
    if tg_op='INSERT' then
      if not public.is_admin() and (new.role<>'user' or new.status<>'active' or new.id<>auth.uid()) then raise exception 'Only an admin can change account privileges'; end if;
    elsif not public.is_admin() and (new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id) then raise exception 'Only an admin can change account privileges';
    end if;
  end if;
  return new;
end $$;

alter table public.profiles drop constraint profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status = any (array['active'::text, 'suspended'::text, 'deleted'::text]));

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
  perform set_config('app.profile_admin_op', 'on', true);

  update posts set author_name = 'Former member' where author_id = uid;
  update resources set uploaded_by = 'Former member' where owner_id = uid;

  delete from group_members where user_id = uid;
  delete from thread_participants where user_id = uid;
  delete from group_invites where created_by = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from content_reports where reporter_id = uid;
  delete from applications where user_id = uid;
  delete from job_alert_prefs where user_id = uid;

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
