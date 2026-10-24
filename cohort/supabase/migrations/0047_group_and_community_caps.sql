-- 0047: caps requested by the founder - a group holds at most 1003 members,
-- a community bundles at most 23 groups. Enforced in the DB so no client
-- path can slip past them. Row locks serialize concurrent joins so two
-- simultaneous inserts cannot both sneak under the cap.

create or replace function public.enforce_group_member_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from public.groups where id = new.group_id for update;
  select count(*) into n from public.group_members where group_id = new.group_id;
  if n >= 1003 then
    raise exception 'This group is full (1003 members).';
  end if;
  return new;
end $$;

create trigger group_members_cap
  before insert on public.group_members
  for each row execute function public.enforce_group_member_cap();

create or replace function public.enforce_community_group_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from public.communities where id = new.community_id for update;
  select count(*) into n from public.community_groups where community_id = new.community_id;
  if n >= 23 then
    raise exception 'This community is full (23 groups).';
  end if;
  return new;
end $$;

create trigger community_groups_cap
  before insert on public.community_groups
  for each row execute function public.enforce_community_group_cap();
