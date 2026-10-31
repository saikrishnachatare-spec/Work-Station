-- Jobs: optional hiring headcount ("Number of openings") shown on the job card.
alter table public.jobs
  add column if not exists openings integer check (openings is null or openings > 0);
