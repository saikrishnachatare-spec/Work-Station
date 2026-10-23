-- Application review workflow: posters mark applicants reviewed/shortlisted/
-- rejected; applicants see the outcome on their own applications. Only the
-- status column is poster-writable; identity columns are trigger-protected.
alter table public.applications add column if not exists status text not null default 'new';
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('new', 'reviewed', 'shortlisted', 'rejected'));

create policy applications_update_poster on public.applications for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.posted_by = auth.uid()))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.posted_by = auth.uid()));

create or replace function public.guard_application_identity()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.id is distinct from old.id or new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
    raise exception 'Application identity cannot change';
  end if;
  return new;
end $$;

drop trigger if exists applications_guard_identity on public.applications;
create trigger applications_guard_identity before update on public.applications
  for each row execute function public.guard_application_identity();
