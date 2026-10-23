create table if not exists public.privilege_audit(id bigint generated always as identity primary key,actor_id uuid,target_id uuid not null,old_role text,new_role text,old_status text,new_status text,changed_at timestamptz not null default now());
alter table public.privilege_audit enable row level security;
create policy audit_admin_read on public.privilege_audit for select to authenticated using(public.is_admin());
create or replace function public.audit_profile_privileges() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.role is distinct from old.role or new.status is distinct from old.status then insert into public.privilege_audit(actor_id,target_id,old_role,new_role,old_status,new_status) values(auth.uid(),new.id,old.role,new.role,old.status,new.status);end if;return new;end $$;
create trigger audit_profile_privileges after update on public.profiles for each row execute function public.audit_profile_privileges();
