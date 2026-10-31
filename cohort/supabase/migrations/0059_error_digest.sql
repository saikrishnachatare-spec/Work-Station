-- Error alerting digest: the first client error of each UTC day notifies every
-- active admin in-app (one per admin per day, deduped); later errors that day
-- stay silent. Links to the admin panel.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'comment', 'application_status', 'connection_request', 'connection_accepted', 'job_match', 'system'));

create or replace function public.notify_admins_on_error() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; v_day text := to_char(now() at time zone 'utc', 'YYYY-MM-DD'); v_count int;
begin
  select count(*) into v_count from public.error_logs where created_at >= date_trunc('day', now());
  for a in select id from public.profiles where role = 'admin' and status = 'active'
  loop
    perform public.enqueue_notification(
      a.id, 'system',
      'New app errors today',
      v_count || ' error' || case when v_count = 1 then '' else 's' end || ' logged today. Latest: ' || left(new.message, 200),
      '/admin',
      'errdigest:' || v_day || ':' || a.id);
  end loop;
  return new;
end $$;

drop trigger if exists error_logs_notify_admins on public.error_logs;
create trigger error_logs_notify_admins after insert on public.error_logs
  for each row execute function public.notify_admins_on_error();
