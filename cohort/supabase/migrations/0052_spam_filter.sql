-- 0052: server-side profanity / spam filter. A short admin-managed blocklist
-- rejects matching text in posts, comments and messages before it is stored.
-- Matching is case-insensitive on word boundaries; admins edit the list in
-- the blocked_terms table (RLS below).

create table if not exists public.blocked_terms (
  term text primary key,
  created_at timestamptz not null default now()
);

alter table public.blocked_terms enable row level security;
create policy blocked_terms_read on public.blocked_terms for select
  using (public.is_admin());
create policy blocked_terms_write on public.blocked_terms for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.blocked_terms (term) values
  ('chutiya'), ('madarchod'), ('bhenchod'), ('randi'), ('harami'),
  ('nigger'), ('faggot'), ('whore'), ('slut'),
  ('leaked paper'), ('leak paper'), ('exam leak'), ('answer key leak')
on conflict (term) do nothing;

create or replace function public.check_clean_text(p_text text) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_term text;
begin
  if p_text is null then return; end if;
  for v_term in select term from public.blocked_terms loop
    if p_text ~* ('\m' || regexp_replace(v_term, '\s+', '\\s+', 'g') || '\M') then
      raise exception 'Please keep it respectful - that text is not allowed on Cohort.';
    end if;
  end loop;
end $$;

create or replace function public.clean_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_clean_text(new.body);
  return new;
end $$;

drop trigger if exists posts_clean on public.posts;
create trigger posts_clean before insert or update of body on public.posts
  for each row execute function public.clean_posts();

create or replace function public.clean_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_clean_text(new.body);
  return new;
end $$;

drop trigger if exists comments_clean on public.comments;
create trigger comments_clean before insert or update of body on public.comments
  for each row execute function public.clean_comments();

create or replace function public.clean_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_clean_text(new.body);
  return new;
end $$;

drop trigger if exists messages_clean on public.messages;
create trigger messages_clean before insert on public.messages
  for each row execute function public.clean_messages();
