-- Optional profile details use the existing signed-in-only profile audience.
alter table public.profiles add column if not exists course text not null default '' check (course in ('','CA','CMA','CS'));
alter table public.profiles add column if not exists level text not null default '' check (level in ('','Foundation','Inter','Final'));
alter table public.profiles add column if not exists avatar_path text;
-- Own-profile edit must never allow self-promotion or reinstatement.
create or replace function public.guard_profile_privileges() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and not public.is_admin() and (new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id) then
   raise exception 'Only an admin can change account privileges';
 end if;
 return new;
end $$;
drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges before update on public.profiles for each row execute function public.guard_profile_privileges();
