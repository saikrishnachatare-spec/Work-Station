-- 0051: per-member rate limits on spam-prone writes. Caps are generous for
-- real use and trip only on scripted abuse; exceeding one raises a plain
-- error the app shows as-is.

-- Applications: 10 per member per day.
create or replace function public.limit_applications_per_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.applications
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have applied to a lot of openings today. Try again tomorrow.';
  end if;
  return new;
end $$;

drop trigger if exists applications_rate_limit on public.applications;
create trigger applications_rate_limit before insert on public.applications
  for each row execute function public.limit_applications_per_day();

-- Group invites: 20 per member per day.
create or replace function public.limit_invites_per_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.group_invites
      where created_by = new.created_by and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have created a lot of invite links today. Try again tomorrow.';
  end if;
  return new;
end $$;

drop trigger if exists invites_rate_limit on public.group_invites;
create trigger invites_rate_limit before insert on public.group_invites
  for each row execute function public.limit_invites_per_day();

-- Resume uploads: 10 per member per day (resumes bucket paths start with the
-- uploader's user id; the owner column is set by Supabase Storage).
create or replace function public.limit_resume_uploads_per_day() returns trigger
language plpgsql security definer set search_path = storage as $$
begin
  if new.bucket_id = 'resumes' then
    if (select count(*) from storage.objects
        where bucket_id = 'resumes' and owner = new.owner
          and created_at > now() - interval '1 day') >= 10 then
      raise exception 'You have uploaded a lot of files today. Try again tomorrow.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists resume_uploads_rate_limit on storage.objects;
create trigger resume_uploads_rate_limit before insert on storage.objects
  for each row execute function public.limit_resume_uploads_per_day();
