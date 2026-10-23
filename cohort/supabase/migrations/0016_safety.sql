create table if not exists public.content_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null default auth.uid(),target_type text not null check(target_type in ('post','user','job')),target_id uuid not null,reason text not null check(length(reason) between 5 and 2000),status text not null default 'open' check(status in ('open','reviewed')),created_at timestamptz not null default now());
alter table public.content_reports enable row level security;
create policy reports_create on public.content_reports for insert to authenticated with check(reporter_id=auth.uid() and status='open' and public.is_active_member());
create policy reports_read on public.content_reports for select to authenticated using(reporter_id=auth.uid() or public.is_admin());
create policy reports_review on public.content_reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
create table if not exists public.user_blocks(blocker_id uuid not null default auth.uid(),blocked_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id));
alter table public.user_blocks enable row level security;
create policy blocks_own on public.user_blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create or replace function public.has_block_between(a uuid,b uuid) returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from public.user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)); $$;
-- Blocking stops direct messages in both directions. Shared group conversations are separate.
create policy messages_block_guard on public.messages as restrictive for insert to authenticated with check(not exists(select 1 from public.thread_participants p where p.thread_id=messages.thread_id and public.has_block_between(auth.uid(),p.user_id)));
