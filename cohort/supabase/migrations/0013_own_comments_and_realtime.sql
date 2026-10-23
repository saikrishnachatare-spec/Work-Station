-- Own-comment editing; match the existing own-post update policy.
create policy comments_update_own on public.comments for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
-- Changes are delivered through existing select RLS, never a public broadcast.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
