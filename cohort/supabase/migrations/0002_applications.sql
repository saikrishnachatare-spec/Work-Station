-- Job applications: Apply button writes a real row per user per job.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

alter table public.applications enable row level security;

create policy applications_read_own on public.applications for select
  using (user_id = auth.uid() or public.is_admin());
create policy applications_insert on public.applications for insert
  with check (user_id = auth.uid());
create policy applications_delete_own on public.applications for delete
  using (user_id = auth.uid());
