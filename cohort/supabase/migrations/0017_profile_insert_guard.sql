create or replace function public.guard_profile_privileges() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null then
   if tg_op='INSERT' then
     if not public.is_admin() and (new.role<>'user' or new.status<>'active' or new.id<>auth.uid()) then raise exception 'Only an admin can change account privileges'; end if;
   elsif not public.is_admin() and (new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id) then raise exception 'Only an admin can change account privileges';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges before insert or update on public.profiles for each row execute function public.guard_profile_privileges();
