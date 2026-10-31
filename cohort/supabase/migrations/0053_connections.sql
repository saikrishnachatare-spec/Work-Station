-- 0053: LinkedIn-style connections. Members send requests; the other side
-- accepts or declines. Only connected members can start DMs or add each
-- other to groups (self-join via invite link stays open to everyone).
-- Existing DM threads and groups are untouched.

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- One row per pair regardless of direction.
create unique index if not exists connections_pair_unique on public.connections
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.connections enable row level security;
-- Your own requests (any status) are private to the two people involved;
-- accepted connections are visible to every signed-in member so profiles
-- can show them.
create policy connections_read on public.connections for select to authenticated
  using (auth.uid() in (requester_id, addressee_id) or status = 'accepted' or public.is_admin());
create policy connections_request on public.connections for insert to authenticated
  with check (
    auth.uid() = requester_id
    and public.is_active_member()
    and status = 'pending'
    and not public.has_block_between(requester_id, addressee_id)
    and exists (select 1 from public.profiles p where p.id = addressee_id and p.status = 'active')
  );
-- Only the addressee answers, and only a pending request.
create policy connections_respond on public.connections for update to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));
-- Requester withdraws a pending request; either side ends a connection.
create policy connections_remove on public.connections for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create or replace function public.are_connected(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- DM gate: new 1:1 threads require a connection (app admins excepted, for
-- support). Existing threads keep working - this only gates start_dm.
create or replace function public.start_dm(p_other uuid, p_first text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_thread uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member() then raise exception 'account_suspended'; end if;
  if p_other is null or p_other = v_me then raise exception 'invalid_recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then raise exception 'recipient_unavailable'; end if;
  if public.has_block_between(v_me, p_other) then raise exception 'blocked'; end if;
  -- Gate: connections only, except admins and firm/enterprise accounts
  -- (they may message applicants directly, per product decision).
  if not (
    public.is_admin()
    or public.are_connected(v_me, p_other)
    or exists (
      select 1 from public.profiles me
      where me.id = v_me and me.account_type in ('firm', 'enterprise')
    )
  ) then
    raise exception 'Connect with this member first - only connections can message each other.';
  end if;
  -- reuse an existing 1:1 thread
  select t.id into v_thread from public.threads t
   where t.group_id is null
     and exists (select 1 from public.thread_participants a where a.thread_id = t.id and a.user_id = v_me)
     and exists (select 1 from public.thread_participants b where b.thread_id = t.id and b.user_id = p_other)
     and (select count(*) from public.thread_participants c where c.thread_id = t.id) = 2
   limit 1;
  if v_thread is null then
    insert into public.threads default values returning id into v_thread;
    insert into public.thread_participants(thread_id, user_id) values (v_thread, v_me), (v_thread, p_other);
  end if;
  -- A blank first message opens the conversation without sending anything;
  -- the member types the real opener themselves (no canned "Hi!").
  if coalesce(btrim(p_first), '') <> '' then
    insert into public.messages(thread_id, sender_id, body) values (v_thread, v_me, btrim(p_first));
  end if;
  return v_thread;
end $$;

-- Group adds by a group admin require a connection with the person being
-- added (or an app admin). Self-join and invite-link joins are the separate
-- members_insert policy and join_group_by_token function, unaffected.
drop policy if exists members_insert_by_group_admin on public.group_members;
create policy members_insert_by_group_admin on public.group_members for insert to authenticated
  with check (
    public.is_group_admin(group_id)
    and user_id <> auth.uid()
    and role = 'member'
    and exists (select 1 from public.profiles p where p.id = user_id and p.status = 'active')
    and (public.is_admin() or public.are_connected(auth.uid(), user_id))
  );

-- Notifications for requests and accepts.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'comment', 'application_status', 'connection_request', 'connection_accepted'));

create or replace function public.notify_on_connection_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select coalesce(nullif(btrim(full_name), ''), 'Someone') into v_name
  from public.profiles where id = new.requester_id;
  perform public.enqueue_notification(
    new.addressee_id, 'connection_request',
    v_name || ' wants to connect',
    'Accept to message each other and add one another to groups.',
    '/connections',
    'conn-req:' || new.id);
  return new;
end $$;

drop trigger if exists connections_notify_request on public.connections;
create trigger connections_notify_request after insert on public.connections
  for each row execute function public.notify_on_connection_request();

create or replace function public.notify_on_connection_accept() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not (old.status = 'pending' and new.status = 'accepted') then return new; end if;
  new.responded_at := now();
  select coalesce(nullif(btrim(full_name), ''), 'Someone') into v_name
  from public.profiles where id = new.addressee_id;
  perform public.enqueue_notification(
    new.requester_id, 'connection_accepted',
    v_name || ' accepted your request',
    'You can now message each other and add one another to groups.',
    '/connections',
    'conn-acc:' || new.id);
  return new;
end $$;

drop trigger if exists connections_notify_accept on public.connections;
create trigger connections_notify_accept before update of status on public.connections
  for each row execute function public.notify_on_connection_accept();
