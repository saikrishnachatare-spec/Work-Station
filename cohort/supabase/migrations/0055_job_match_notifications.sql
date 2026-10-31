-- Vacancy alerts as in-app notifications: when a job is posted, members whose
-- saved alert keywords match the role/firm/location/tags get a 'job_match'
-- notification (deduped per job per user).

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'comment', 'application_status', 'connection_request', 'connection_accepted', 'job_match'));

create or replace function public.notify_on_job_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p record;
  kw text;
  hay text := lower(new.role || ' ' || coalesce(new.firm, '') || ' ' || coalesce(new.loc, '') || ' ' || array_to_string(coalesce(new.tags, '{}'), ' '));
begin
  for p in
    select user_id, keywords from public.job_alert_prefs
    where btrim(keywords) <> '' and user_id is distinct from new.posted_by
  loop
    for kw in select btrim(unnest(regexp_split_to_array(lower(p.keywords), '[,\s]+')))
    loop
      if kw <> '' and position(kw in hay) > 0 then
        perform public.enqueue_notification(
          p.user_id, 'job_match',
          'New opening matches your alerts',
          new.role || coalesce(' at ' || nullif(new.firm, ''), '') || coalesce(' - ' || nullif(new.loc, ''), ''),
          '/job?id=' || new.id,
          'jobmatch:' || new.id || ':' || p.user_id);
        exit;
      end if;
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists jobs_notify_match on public.jobs;
create trigger jobs_notify_match after insert on public.jobs
  for each row execute function public.notify_on_job_match();
