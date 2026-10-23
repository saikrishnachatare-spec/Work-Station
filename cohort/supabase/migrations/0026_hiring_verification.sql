-- Professional/org verification, distinct from email confirmation.
-- verified_at is admin-granted only; hiring openings require it, gig work stays open.
alter table public.profiles add column if not exists verified_at timestamptz;

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.profile_admin_op', true), '') <> 'on' then
    if tg_op='INSERT' then
      if not public.is_admin() and (new.role<>'user' or new.status<>'active' or new.id<>auth.uid() or new.verified_at is not null) then raise exception 'Only an admin can change account privileges'; end if;
    elsif not public.is_admin() and (new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id or new.verified_at is distinct from old.verified_at) then raise exception 'Only an admin can change account privileges';
    end if;
  end if;
  return new;
end $$;

create or replace function public.is_verified_member()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and verified_at is not null
  );
$$;

drop policy jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated
  with check (
    auth.uid() = posted_by
    and public.is_active_member()
    and (cat = 'Gig work' or public.is_verified_member())
  );

-- a deleted profile must not keep a verification mark
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
         status = 'deleted',
         verified_at = null
   where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
