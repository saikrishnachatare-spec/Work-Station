-- Signup account types: individual / firm / enterprise, with org name for
-- organisations. New-user trigger copies the declaration from signup metadata.
-- Posters of an opening can read its applications (hiring dashboard).
alter table public.profiles add column if not exists account_type text not null default 'individual';
alter table public.profiles add column if not exists org_name text not null default '';
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in ('individual', 'firm', 'enterprise'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.profiles (id, full_name, account_type, org_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'account_type' in ('firm', 'enterprise')
         then new.raw_user_meta_data->>'account_type' else 'individual' end,
    case when new.raw_user_meta_data->>'account_type' in ('firm', 'enterprise')
         then coalesce(new.raw_user_meta_data->>'org_name', '') else '' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create policy applications_read_for_poster on public.applications for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.posted_by = auth.uid()));
