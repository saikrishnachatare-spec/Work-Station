# D1 schema mapping (preparation)

Status: SLICE 1 only (2026-11-06). `apps/api-worker/migrations/0001_core_social.sql`
covers profiles/posts/post_likes/comments and APPLIES on local D1 (verified
with `wrangler d1 execute --local`, synthetic row insert + join OK).

## Full Supabase inventory (source: cohort/supabase/migrations, 68 files)

- 29 tables: activity_log, applications, blocked_terms, comments, communities,
  community_groups, connections, content_reports, controlled_test_accounts,
  error_logs, group_invites, group_members, groups, job_alert_prefs, jobs,
  messages, notifications, post_likes, posts, privilege_audit,
  profile_contacts, profiles, resources, student_notes, thread_participants,
  threads, trash, user_blocks, verification_requests
- 193 RLS policies - the authorization model. These do NOT translate to D1;
  they must be re-expressed as worker-side checks. This is the real work of
  the migration, not the DDL.
- ~91 SQL functions/RPCs; the app calls 13 of them (start_dm,
  mark_thread_read, log_screen_view, join_group_by_token,
  group_by_invite_token, review_verification_request, delete_my_account,
  admin_analytics, admin_db_overview, admin_db_recent, admin_trash,
  admin_restore, admin_purge). The rest are triggers/helpers whose logic
  moves into worker code.
- Storage buckets (post-images, avatars, student-notes, resource files) ->
  R2, keys mirroring the current `<uid>/...` layout; bucket policies become
  worker checks like the RLS rules.

## Translation decisions (slice 1)

| Postgres | D1 (SQLite) | Notes |
| --- | --- | --- |
| uuid PK (gen_random_uuid()) | TEXT PK | worker mints crypto.randomUUID() |
| timestamptz default now() | TEXT ISO, default datetime('now') | UTC ISO strings |
| boolean | INTEGER 0/1 | |
| RLS policies | none | worker authz.ts per endpoint |
| count triggers (like/comment) | none | worker updates counters in the same request path |
| auth.users FK | profiles.id = Clerk external_id (Supabase UUID at import) | |

## Slice plan toward parity

1. (done) core social DDL + local D1 apply
2. worker endpoints for the slice with authz checks ported from the RLS
   policies of these 4 tables, synthetic two-user allow/deny tests (local)
3. messaging (threads/messages/thread_participants) + connections
4. jobs/applications/verification_requests + admin RPCs
5. groups/communities/resources/student_notes + notifications
6. storage -> R2 with policy-equivalent checks
7. full export/import rehearsal (needs his approval + CLERK_SECRET_KEY)
