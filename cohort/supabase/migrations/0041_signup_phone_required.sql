-- Phone is required to create an account (user decision 2026-10-24: signup
-- cannot finish with a blank number). The form validates first; this is the
-- server-side backstop so direct auth-API calls and stale clients cannot
-- create an account without a valid number. The exception message carries
-- no user data. Existing accounts and sign-in are untouched: this trigger
-- fires only on new-user insert.
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
  if phone = '' or phone !~ '^\+?\d{8,15}$' then
    raise exception 'phone_number_required_or_invalid';
  end if;
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
  insert into public.profile_contacts (user_id, phone)
  values (new.id, phone)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
