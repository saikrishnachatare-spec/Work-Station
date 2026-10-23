-- Close = closed opening with application history retained (owner-scoped),
-- distinct from remove/delete (trash). Public listings show open openings only.
alter table public.jobs add column if not exists status text not null default 'open';
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in ('open', 'closed'));

drop policy jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated
  using (status = 'open' or posted_by = auth.uid() or public.is_admin());

-- guests use the demo feed, but keep the read policy honest for anon too
drop policy if exists jobs_read_anon on public.jobs;
create policy jobs_read_anon on public.jobs for select to anon
  using (status = 'open');

-- sign-in events: one per actor per 15 minutes at most (snapshot semantics,
-- never a complete auth-event stream)
create or replace function public.log_auth_activity() returns trigger
language plpgsql security definer set search_path='public' as $$
begin
  if tg_op = 'UPDATE' and new.last_sign_in_at is distinct from old.last_sign_in_at then
    if not exists (
      select 1 from public.activity_log
      where actor_id = new.id and action = 'sign_in' and created_at > now() - interval '15 minutes'
    ) then
      insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
      values (new.id, public.actor_display_name(new.id), 'sign_in', 'auth', new.id::text);
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id)
    values (null, '', 'account_deleted', 'auth', old.id::text);
    return old;
  end if;
  return new;
end $$;

-- applications only to open openings
drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications for insert to public
  with check (auth.uid() = user_id and is_active_member()
    and exists (select 1 from jobs j where j.id = job_id and j.status = 'open'));
