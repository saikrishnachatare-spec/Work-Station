-- Members can request professional verification; admins review in the admin panel.

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists verification_requests_one_open
  on public.verification_requests (user_id) where status = 'pending';

alter table public.verification_requests enable row level security;

create policy verification_requests_read_own on public.verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy verification_requests_insert_own on public.verification_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.verified_at is null)
  );

create policy verification_requests_update_admin on public.verification_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- One RPC resolves a request so the member-facing update and the profile flag
-- stay consistent (admins only).
create or replace function public.review_verification_request(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end, responded_at = now()
  where id = p_id and status = 'pending'
  returning user_id into v_user;
  if v_user is null then raise exception 'request_not_found'; end if;
  if p_approve then
    update public.profiles set verified_at = now() where id = v_user;
  end if;
  perform public.enqueue_notification(
    v_user, 'application_status',
    case when p_approve then 'You are now a verified professional' else 'Verification request declined' end,
    case when p_approve
      then 'Your profile shows the verified badge and you can post job openings.'
      else 'The team could not verify the profile yet. Add more detail to your profile and request again.'
    end,
    '/account',
    'verify:' || p_id);
end $$;
