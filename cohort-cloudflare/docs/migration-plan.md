# Cohort → Cloudflare migration plan (preparation)

Goal (his words): everything under our control on the Cloudflare stack,
self-hosted auth via Better Auth, free tiers where possible, live app and
accounts untouched until a tested switch is approved.

## Proven so far (local, wrangler dev / miniflare, 2026-11-05)

- Better Auth 1.7.17 runs on the Workers runtime with a D1 database:
  sign-up, sign-in, session, sign-out all pass; wrong passwords rejected;
  Cohort's min-8 password rule enforced.
- Supabase password hashes are portable: a simulated migrated user (UUID
  preserved, `$2a$10$` bcrypt hash as Supabase stores it) signed in with
  their original password through Better Auth configured with bcryptjs.
- D1 + R2 bindings work from a Worker (api-worker stub health check).
- Web sign-out/POSTs require the Origin header; `https://ca.chatare.space`
  is in trustedOrigins. Browsers send it automatically; native will use
  Better Auth's Expo plugin (not yet wired).

## Open constraint: Workers Free CPU limit vs password hashing

Measured: bcryptjs compare at cost 10 ≈ 63 ms CPU (Node 22; workerd will be
similar order). Cloudflare documents Workers Free CPU time at **10 ms per
request** (Paid: 5 min) — https://developers.cloudflare.com/workers/platform/limits/ (checked 2026-11-05).

Every sign-in and sign-up must run a password hash, and any secure KDF
(bcrypt/scrypt/PBKDF2 at safe parameters) exceeds 10 ms of CPU. Options:

1. **Workers Paid ($5/month)** — solves it outright; also lifts the
   100k requests/day free cap. Requires his explicit approval (money).
2. Lower-cost hashing to fit 10 ms — weakens password security. Not
   recommended.
3. Keep Supabase Auth and migrate only data/storage — fails the "own our
   auth" goal.

Recommendation: option 1 when we approach cutover. Local prep continues on
the free tooling meanwhile; nothing is blocked before then.

Also to verify at cutover: D1 free tier limits (5 GB storage, 5M reads/day —
current data is 14 MB, fine) and R2 free allowances (10 GB, no egress fees —
current files are 77 KB, fine).

## Stages

- [x] **0. Prep plumbing** — this folder; auth worker + D1/R2 stub tested.
- [ ] **1. Auth** — create real D1 (needs approval), apply schema, export
  Supabase auth users (verify the real hash export, not just the format),
  import preserving UUIDs, wire email delivery via Brevo's HTTP API
  (Workers cannot do raw SMTP), full flow test on a preview URL.
  Note: at cutover every existing session ends — everyone signs in once.
- [ ] **2. Authorization parity** — Supabase RLS policies today decide who
  can read/write what. On Workers that logic must be re-implemented in the
  API worker. Needs negative tests (user A cannot read/write user B's
  private data) before any cutover; UUID preservation alone is not parity.
- [ ] **3. App database** — map the 64 Supabase Postgres migrations to D1
  (SQLite): type differences, no PL/pgSQL, RPC functions rewritten as
  Worker code, triggers reconsidered. Largest single work item.
- [ ] **4. Realtime** — messages/notifications use Supabase realtime;
  replacement options: polling first, or Durable Objects/WebSockets later.
  Decide before cutover.
- [ ] **5. Storage** — migrate files (currently ~77 KB) to R2, serve via
  the API worker with auth checks.
- [ ] **6. Frontend** — swap supabase-js for Better Auth client + API calls
  in `cohort/apps/mobile` (Expo plugin for native, fetch for web), behind
  a config flag so the live app is untouched until the switch.
- [ ] **7. Cutover** — preview deploy → full app-flow test (his rule: test
  everything, then fix, then re-verify) → approval → DNS/routing switch →
  rollback plan ready. Production sessions end at switch.

## Rules throughout

- No paid services without his yes. No production writes. No real emails.
- Existing test accounts (etest1–20) untouched; prep uses throwaway local
  fixtures only.
