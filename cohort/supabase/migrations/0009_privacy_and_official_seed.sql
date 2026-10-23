-- 0009: tighten profile visibility; remove fabricated OFFICIAL exam announcement.
--
-- 1) profiles was world-readable (anon included): every member's name, role,
--    status and signup date enumerable by anyone with the publishable key.
--    Member-directory visibility is fine for signed-in members, not for the
--    open internet. Invite previews use a security-definer RPC and are
--    unaffected.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (auth.role() = 'authenticated');

-- 2) Seed data shipped a pinned "Board of Studies" announcement claiming the
--    Nov 2026 exam schedule "is out". That is a fabricated official notice and
--    could mislead students about real exam logistics. Remove it.
delete from public.posts
  where kind = 'announcement' and author_name = 'Board of Studies' and author_id is null;
