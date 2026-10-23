-- Subject tags on shared resources so uploads can be browsed by subject.
alter table public.resources add column if not exists subject text not null default '';
