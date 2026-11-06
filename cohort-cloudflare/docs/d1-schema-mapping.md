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

## Slice 2: endpoints + ported authorization (2026-11-06)

### Effective-policy replay correction

The earlier "193 policies" figure counted cumulative CREATE POLICY statements
across all 68 migration files. Policies are dropped and recreated over time,
so the effective current count comes from a create/drop replay over the
ordered migrations: ~97 effective policies (text-replay approximation - the
live database is the final authority). Slice-2 semantics below come from
reading the effective policy text for these 4 tables directly.

### Ported authorization semantics (worker src/index.ts)

| Rule | Source | Ported as |
| --- | --- | --- |
| posts/likes/comments SELECT public (guests included) | 0001 `using (true)` | GET /api/feed, GET /api/posts/:id/comments need no token |
| profiles SELECT authenticated-only | 0009 | (no profiles endpoint in this slice; rule recorded) |
| posts INSERT: active member, author_id = caller, kind='post' unless admin | 0001 + 0044 | POST /api/posts; client-sent author_id mismatch -> 403 |
| post_rate_ok(): <10 own posts/hour | 0044 | COUNT query in worker |
| likes INSERT: active member, user_id = caller | 0007 | POST /api/posts/:id/like; double like -> 409 (PK) |
| likes DELETE: user_id = caller only (NO admin override) | 0001 | DELETE .../like; admin deleting another's like -> 404 |
| comments INSERT: active member, author_id = caller | 0044 | POST /api/posts/:id/comments; body <=2000 (PG CHECK) |
| comment_rate_ok(): <20 own comments/10min | 0044 | COUNT query in worker |
| comments DELETE: owner or admin | 0001/0013 | DELETE /api/comments/:id |
| blocked-terms body filter | 0052 | seeded term list in worker, same rejection message |
| is_active_member() = profile status 'active' | 0007 | suspended/deleted -> 403 on all writes, reads stay public |
| is_admin() = role 'admin' AND status 'active' | 0001 | |
| like_count/comment_count upkeep | 0001/0010 triggers | worker increments/decrements in the same request |

### Known parity gaps / upstream observations (carried, not resolved)

- blocked_terms is admin-editable in Supabase; the worker port uses the
  seeded static list only. Admin editing -> later slice.
- posts_guard_flags trigger (0044) guards kind/pinned/author on UPDATE only.
  This slice ships no post-update endpoint, so there is nothing to guard yet.
  NOTE: PG policy does NOT guard `pinned` on INSERT (non-admin can insert a
  pinned post) - mirrored as-is; flagged as an upstream observation, not a
  port bug.
- posts_update/post_rate_ok failure returns PG's policy-violation error; the
  worker returns 403 rate_limited. Status-code shape is a port choice.
- user_blocks affects DMs only (0016) - out of slice scope, no feed effect.
- Deleted accounts: PG cascades via FK; D1 schema keeps ON DELETE CASCADE and
  writes require an active profile row.
- 20261023000100_profiles.sql is a stale dated draft duplicating 0001 with a
  different role enum (student/mentor/firm/moderator) and its own policies;
  applying it after 0001 would error on policy re-creation. Effective schema
  follows the numbered migrations (role in user/admin). Slice-1 D1 migration
  corrected accordingly (role enum + status column added).

### Slice-2 local test evidence

test/run-slice2-local.sh: throwaway RSA keypair per run, .dev.vars swapped to
the synthetic issuer and restored on exit, local D1 reset + seeded with
synthetic active/suspended/admin profiles, wrangler dev --local. 39/39
assertions passed (2026-11-06): public reads, 401 no/expired/garbage token,
suspended -> 403 on all writes, forged author_id -> 403, admin-only
announcement, blocked terms -> 422, double-like 409, admin-cannot-unlike
(404), comment delete owner/non-owner/admin matrix, ownership always from the
token's external_id, rate-limit boundaries (11th post/hour -> 403,
21st comment/10min -> 403, other users unaffected), count upkeep nets to zero.

Race safety of count upkeep: like insert + count recompute run in ONE D1
batch (a serialized transaction), so the PK conflict path can never leave a
half-updated count. Unlike deletes first and checks meta.changes, so a
concurrent double-unlike recomputes at most once; the recompute itself is
absolute (COUNT(*) from post_likes), so transient interleavings self-heal on
the next write. Comment insert/delete recompute comment_count from the
comments table inside their batch. Remaining known window: unlike's
recompute is a second statement after its DELETE (not one batch), so a reader
between the two can see a briefly stale count - value-correctness holds, not
instant-visibility.

Scope of "parity": the above is POLICY-TEXT parity - every allow/deny rule in
the effective RLS policies for these 4 tables is mirrored and tested. It is
not complete behavior parity: Postgres error codes/messages, trigger
side-effects (admin activity logging 0032, notifications 0050), realtime
broadcasts, and multi-instance concurrency are NOT ported/tested.

NOT covered by tests: multi-instance concurrency, real Clerk tokens against
these endpoints (verified earlier against /api/me only; real-token run gated
on user approval for sandbox use of the saved test-user login), and
external_id-bearing imported-user tokens (untestable until the import stage
by design - external_id is Backend-API-only).
