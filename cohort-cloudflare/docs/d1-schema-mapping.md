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

NOT covered by tests: multi-instance concurrency, and real Clerk tokens
against these endpoints. Real-token attempt (2026-11-06, local only, user-
approved sandbox use of the saved test-user login, password never printed,
files deleted after): Clerk FAPI password first factor VERIFIED, then the
device-trust email-code step requires the dev-instance browser handshake
cookie (__clerk_db_jwt), which non-browser clients cannot bootstrap (405 on
/v1/dev_browser both hosts). So no fresh real token could be minted without a
browser run. Already proven: a REAL Clerk dev token verifies through this
worker's verifyToken path (Nov 5 interactive end-to-end, HTTP 200 /api/me via
the /clerk-prep route) - and every new endpoint uses that same verification
helper. Still open by design: external_id-bearing imported-user tokens
(untestable until the scoped import rehearsal; external_id is
Backend-API-only).

## Slice 3: messaging + connections schema and authorization mapping (2026-11-06)

`apps/api-worker/migrations/0002_messaging_connections.sql` APPLIES on local D1
(verified 2026-11-06: synthetic seed across all tables; reversed-pair duplicate
rejected by `connections_pair_unique`; empty body rejected by the 1..4000 CHECK;
self-block rejected; re-request after decline accepted (0060 semantics);
DM-thread message/participant join OK). Schema + mapping only - NO endpoints yet.

### Tables (D1)

| Table | Source | Notes |
| --- | --- | --- |
| groups (STUB) | 0001 + kind 0045 | only the columns messaging authz needs; slice 5 expands |
| group_members (STUB) | 0001 + role 0036 | same |
| threads | 0001 + group_id 0008 | group_id NULL = DM; non-NULL = group/channel chat |
| thread_participants | 0001 + last_read_at 0020 | last_read_at powers unread counts |
| messages | 0001 + cap 0044 | CHECK length(body) 1..4000; indexes on (thread_id,created_at),(sender_id,created_at) |
| connections | 0053 + 0060 | partial unique pair index on (min(r,a), max(r,a)) WHERE status IN (pending,accepted) - declined rows do not hold the pair (re-request allowed) |
| user_blocks | 0016 | PG default blocker_id=auth.uid() moves to worker code |

### Effective authorization semantics (create/drop replay, then direct reads)

threads (2 policies):
- threads_read (0043): authenticated AND (is_thread_member(id) OR (group_id set AND is_group_member) OR is_admin()).
- threads_insert (0043): group threads only - group_id set + is_group_member + is_active_member. DM threads are NOT insertable directly; start_dm RPC (security definer) creates them.

messages (2 policies):
- messages_read (0008): is_thread_member(thread_id) OR is_group_thread_member(thread_id). No admin override in the policy text (admin DM visibility comes from 0058 only via start_dm access, not read). No `to authenticated` clause, but the helper functions all key on auth.uid(), so guests get nothing.
- messages_insert (0045): sender_id = caller AND active member AND (thread member OR (group-thread member AND (channel kind = 'group' OR group admin))) AND no block between caller and ANY thread participant AND message_rate_ok() (<30 own messages/minute, 0044).

thread_participants (1 policy):
- participants_read (0004): self OR admin OR fellow member of the same thread. No direct insert policy - participants are written by start_dm (definer) / group-join paths.

connections (4 policies, 0053):
- connections_read: caller involved OR status='accepted' (accepted connections are visible to EVERY signed-in member - profiles show them) OR admin.
- connections_request (insert): requester = caller AND active member AND status='pending' AND no block either way AND addressee profile exists and is active.
- connections_respond (update): addressee only, from 'pending' to 'accepted'/'declined'.
- connections_remove (delete): requester OR addressee (withdraw pending / end connection).
- 0060: pair uniqueness only over live states - after a decline, either side may re-request.

user_blocks (1 policy, 0016): blocks_own - full CRUD on rows where blocker_id = caller. has_block_between(a,b) checks both directions (0016).

RPCs the app calls (must become worker endpoints in the endpoints slice):
- start_dm(p_other, p_first) (final def 0058): auth + active member; recipient exists+active; no block; GATE: is_admin() OR are_connected OR recipient is admin OR caller account_type in (firm,enterprise) - else 'Connect with this member first'; reuses existing 2-person DM thread else creates thread + 2 participants; blank first message opens thread without a message; non-blank inserts it (body trim).
- mark_thread_read(p_thread) (0020): updates ONLY the caller's thread_participants.last_read_at; not_a_participant error otherwise.

### Parity gaps / carried observations (slice 3)

- Trigger side-effects NOT ported: messages_notify (0050, notifications on new message), messages_clean (0052, blocked-terms on message bodies - the filter itself ports as worker code like slice 2), connections_notify_request/accept (0053).
- unread-count/read-state semantics: last_read_at column carried; app-side unread counting to be ported with endpoints.
- Group-channel posting rule depends on groups.kind + is_group_admin (stubs); full group semantics arrive in slice 5 - until then group-thread rules are mapped but only stub-testable.
- messages.sender_id is nullable in PG (0001) - kept nullable; worker always sets it from the token.
- sqlite min()/max() scalar functions replicate PG least()/greatest() in the pair index.

### Slice-3 endpoints + tests (2026-11-06)

Worker endpoints (apps/api-worker/src/index.ts): POST /api/dm (start_dm port),
GET /api/threads (threads_read as list; admin sees all), GET/POST
/api/threads/:id/messages (messages_read/insert ports), POST
/api/threads/:id/read (mark_thread_read port), GET/POST /api/connections +
POST /api/connections/:id/respond + DELETE /api/connections/:id,
GET/POST/DELETE /api/blocks (user_blocks own rows).

test/run-slice3-local.sh: 84/84 assertions PASS (2026-11-06), synthetic
issuer + seeded local D1 only. Covers: 401/403 auth matrix incl. expired and
unmapped tokens; DM gate (connected/admin-recipient/firm-caller exemptions,
reuse, blank-first, blocked-term and length on first message); message read
rules incl. NO admin override on DM bodies (mirrored) and group membership;
message insert rules incl. forged sender_id, channel-vs-group posting via
group-admin distinction; block/unblock both directions + cross-user
isolation; mark-read own-row-only; connection request/respond/delete matrix
incl. reverse-duplicate 409, re-request after decline (0060), block and
suspension checks; rate-limit boundary (31st/min -> 403) + per-user
isolation; start_dm first-message rate-limit bypass (mirrored upstream gap).

Mirrored non-obvious upstream semantics (observations, NOT silent changes):
- Suspension deny is NOT blanket: it blocks start_dm, messages_insert,
  connections_request (source checks is_active_member) but NOT
  connections_respond, connections_remove, user_blocks CRUD or
  mark_thread_read (no upstream check) - a suspended member can still accept
  a pending request, remove connections, manage blocks and mark read.
- start_dm's first-message insert bypasses the 30/min rate limit (security
  definer bypasses RLS; the blocked-terms TRIGGER still applies) - mirrored.
- Admin can list DM threads but cannot read their message bodies.
- Group/channel rules tested against STUB groups/group_members rows only;
  full group semantics land in slice 5.
- Not ported: notification triggers (messages_notify 0050,
  connections_notify_request/accept 0053), realtime, unread-count badges
  (last_read_at carried), PG error shapes.
