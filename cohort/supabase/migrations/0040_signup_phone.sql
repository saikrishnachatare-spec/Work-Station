-- Signup collects a contact phone number (unverified; the user asked to
-- collect the data only, no SMS verification). It is personal data, so it
-- does NOT go on public.profiles (readable by every signed-in member).
-- profile_contacts is readable only by the owner and admins, written only by
-- the new-user trigger, and removed by delete_my_account.

create table if not exists public.profile_contacts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null default '',
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_contacts enable row level security;

-- Read: only the owner and admins. No insert/update/delete policies, so
-- clients cannot write; the row is created by the security-definer trigger.
create policy profile_contacts_read_own on public.profile_contacts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  acct text := case when new.raw_user_meta_data->>'account_type' in ('firm', 'enterprise')
                    then new.raw_user_meta_data->>'account_type' else 'individual' end;
  phone text := left(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), 32);
begin
  insert into public.profiles (id, full_name, account_type, org_name, course, level)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    acct,
    case when acct in ('firm', 'enterprise') then coalesce(new.raw_user_meta_data->>'org_name', '') else '' end,
    case when new.raw_user_meta_data->>'course' in ('CA', 'CMA', 'CS') then new.raw_user_meta_data->>'course' else '' end,
    case when acct = 'individual' then coalesce(new.raw_user_meta_data->>'level', '') else '' end
  )
  on conflict (id) do nothing;
  if phone <> '' then
    insert into public.profile_contacts (user_id, phone)
    values (new.id, phone)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

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

  -- Private contact details go with the account (phone is personal data).
  delete from profile_contacts where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
