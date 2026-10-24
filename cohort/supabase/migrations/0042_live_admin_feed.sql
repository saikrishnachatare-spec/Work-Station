-- Live admin feed: publish new activity and error rows over Realtime.
-- Row-level security still applies to Realtime, so only admins (the only
-- role allowed to select these tables) receive the events.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='activity_log') then
    alter publication supabase_realtime add table public.activity_log;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='error_logs') then
    alter publication supabase_realtime add table public.error_logs;
  end if;
end $$;
