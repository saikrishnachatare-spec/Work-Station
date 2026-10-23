-- 0012: clear seeded sample content and known test artifacts (user-directed).
-- Preserves real accounts (Sai Krishna, Jahnavi), the controlled test accounts
-- (Cohort Test, E2E Three) still needed for regression testing, and the user's
-- own "Test 1" group (created by his account - preserved).

-- Seeded demo posts (author_id is null = seed rows) and the reviewer QA post.
-- Comments and likes cascade from posts.
delete from public.posts
 where author_id is null
    or body = 'QA test post - automated check, safe to delete';

-- Seeded demo groups (created_by is null = seed rows) and the reviewer QA
-- group. Memberships, threads, messages and invites cascade from groups.
delete from public.groups
 where created_by is null
    or name = 'QA test group (safe to delete)';

-- Seeded demo jobs (posted_by is null = seed rows). Applications cascade.
delete from public.jobs where posted_by is null;

-- Seeded demo resources (all uploaded in the original seed batch).
delete from public.resources
 where created_at = '2026-10-23 12:54:48.868728+00'::timestamptz;

-- Test DM thread between the controlled accounts (delivery verification).
delete from public.threads
 where id = 'ef142ac6-4dc9-4ca4-b0db-95814f01c250';

-- Stray unconfirmed test sign-ups (smtpverify2 / smtptest). Cascades to profiles.
delete from auth.users
 where email like '%smtpverify2%' or email like '%smtptest%';

-- Two orphan profiles whose corresponding auth.users were already absent.
-- Confirmed known test identities; not selected by name or account age.
delete from public.profiles where id in (
 'f2c5d401-6e52-4dbc-95c7-fe7357d056e5',
 '893c58e7-12b4-43b1-b556-6dbdb373e27e'
) and not exists (select 1 from auth.users u where u.id=profiles.id);
-- Early controlled wiring-check messages. Preserve user-authored Hi messages.
delete from public.messages where thread_id='ea140675-2d91-4076-a821-6facbcc129e0';
delete from public.threads where id='ea140675-2d91-4076-a821-6facbcc129e0';
