-- 0011: reconcile displayed counts to actual rows.
-- Seeded member_count / comment_count values never matched real rows, which
-- made groups and posts look busier than they are. Recompute from the source
-- tables; the existing triggers keep them truthful going forward.

update public.groups g
set member_count = (select count(*) from public.group_members m where m.group_id = g.id);

update public.posts p
set comment_count = (select count(*) from public.comments c where c.post_id = p.id);
