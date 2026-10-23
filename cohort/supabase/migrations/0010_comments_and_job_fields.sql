-- 0010: real post comments; job description + deadline fields.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  author_id uuid not null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

-- Anyone can read comments (posts themselves are public); signed-in users comment as themselves.
create policy comments_read on public.comments for select using (true);
create policy comments_insert on public.comments for insert with check (auth.uid() = author_id);
create policy comments_delete on public.comments for delete using (auth.uid() = author_id or public.is_admin());

-- Keep posts.comment_count truthful as comments come and go.
create or replace function public.sync_post_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.sync_post_comment_count();

-- Job postings get a real description and an application deadline.
alter table public.jobs add column if not exists description text not null default '';
alter table public.jobs add column if not exists deadline date;
