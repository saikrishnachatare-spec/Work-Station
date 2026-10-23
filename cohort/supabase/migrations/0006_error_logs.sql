-- Client-side error reporting: the web app posts uncaught errors and rejected
-- promises here; only admins can read or clear them.
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  message text not null,
  stack text,
  url text,
  user_agent text
);

alter table public.error_logs enable row level security;

-- Anyone can report an error (including guests); only admins can read or clear.
create policy errors_insert on public.error_logs for insert with check (true);
create policy errors_read on public.error_logs for select using (public.is_admin());
create policy errors_delete on public.error_logs for delete using (public.is_admin());
