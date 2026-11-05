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

## CPU feasibility - RESOLVED by deployed free-plan test (2026-11-05)

Ran an isolated throwaway worker (`cohort-cpu-test`, secret-gated, synthetic
fixtures only, deleted after the test) on his real free-plan Cloudflare
account. Results captured via `wrangler tail`:

- Sign-in-equivalent request (bcryptjs compare at cost 10 - the operation
  imported Supabase users need): **~126 ms CPU, HTTP 200, outcome ok**, plus
  a PBKDF2 probe and a D1 query in the same request.
- ~20 requests total, zero CPU-limit failures, including one burst request
  running 8 bcrypt compares: 663 ms CPU, outcome ok.
- Earlier local proxy measurement (~63 ms on Node) was the right order of
  magnitude; workerd is somewhat slower (~80-165 ms per compare) but the
  free plan did not block it.

Important honesty: Cloudflare still **documents** 10 ms CPU per request on
Workers Free (https://developers.cloudflare.com/workers/platform/limits/).
Empirically it was not enforced against these requests - enforcement is
reactive, not a per-request hard kill, and Cloudflare could tighten it.
At Cohort's scale (occasional sign-ins for a small user base) the practical
headroom is large. If enforcement ever becomes a problem, Workers Paid
($5/month) is the fallback - not needed now, and no longer a blocker for
choosing this stack.

Second finding: workerd's WebCrypto PBKDF2 is **hard-capped at 100,000
iterations** (throws `NotSupportedError` above that), below OWASP's 600k
recommendation for PBKDF2-SHA256. So PBKDF2 is not a stronger on-Workers
alternative; bcrypt remains the hashing choice, which also matches what
imported Supabase users need.

## Stages

- [x] **0. Prep plumbing** — this folder; auth worker + D1/R2 stub tested.
- [x] **1a. Deployed CPU feasibility** — passed on the real free plan
  (see above).
- [ ] **1b. Auth** — create the real auth D1 (needs approval), apply schema, export
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
