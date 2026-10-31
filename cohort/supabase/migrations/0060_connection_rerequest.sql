-- A declined request must not block the pair forever: only live states
-- (pending/accepted) hold the pair uniqueness; declined rows are history.

alter table public.connections drop constraint if exists connections_requester_id_addressee_id_key;
drop index if exists public.connections_pair_unique;
create unique index connections_pair_unique on public.connections
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');
