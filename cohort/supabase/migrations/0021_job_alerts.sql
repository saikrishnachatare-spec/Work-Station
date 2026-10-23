-- Vacancy alerts: per-user keyword prefs; matching is computed in-app when the user opens Work.
create table if not exists public.job_alert_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keywords text not null default '',
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.job_alert_prefs enable row level security;
create policy job_alert_own on public.job_alert_prefs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
