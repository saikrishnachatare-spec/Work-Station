-- Signup also declares course (CA/CMA/CS) and level (student level or Member);
-- for firms the course column carries the firm professional type.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  acct text := case when new.raw_user_meta_data->>'account_type' in ('firm', 'enterprise')
                    then new.raw_user_meta_data->>'account_type' else 'individual' end;
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
  return new;
end;
$$;

alter table public.profiles drop constraint profiles_level_check;
alter table public.profiles add constraint profiles_level_check
  check (level = any (array['', 'Foundation', 'Inter', 'Final', 'Executive', 'Professional', 'Member']));
