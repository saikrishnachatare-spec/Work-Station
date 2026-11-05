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

## CPU constraint - measured facts, free-plan readiness NOT established (2026-11-05)

An isolated throwaway worker (`cohort-cpu-test`, secret-gated, synthetic
fixtures only, deleted after the test) ran on his real free-plan account:

- A sign-in-equivalent request (bcryptjs compare at Supabase's cost-10, the
  operation imported users need, plus a D1 query) used **~126 ms CPU** and
  returned HTTP 200.
- Bounded sample only: ~20 requests, all HTTP 200, including one burst
  request running 8 compares (663 ms CPU). This is a small sample on one
  day, not sustained-load evidence.

Against the documented limit
(https://developers.cloudflare.com/workers/platform/limits/,
checked 2026-11-05):

- Workers Free allows **10 ms CPU per request**; the measured auth operation
  is ~12x over that budget. In this assessment no supported free-budget
  route was found: the tested bcrypt configuration measures ~126 ms in
  workerd, and workerd's WebCrypto PBKDF2 is hard-capped at 100,000
  iterations (below OWASP's 600k recommendation for PBKDF2-SHA256). This
  is what we tested and found - not a proof that no free-budget approach
  could exist.
- The same page says: "Each isolate has some built-in flexibility to allow
  for cases where your Worker infrequently runs over the configured limit.
  If your Worker starts hitting the limit consistently, its execution will
  be terminated" (Error 1102). Cohort's sign-ins would exceed the limit on
  **every** auth request; whether Cloudflare's tolerance treats low-volume
  but always-over traffic as "infrequent" is not defined, so free-plan
  production readiness for this auth design is NOT established.
- The page's documented resolutions for CPU-limit errors: raise the limit
  on Workers Paid (starts at $5/month, plus any usage-based charges -
  not a fixed guaranteed total), optimize the code, or offload to Durable
  Objects (also a paid-plan feature).

Decision deferred to him before any further build: (a) Workers Paid
(starts at $5/month plus any usage-based charges) - the documented
supported route for this workload; (b) keep Supabase Auth and move only
data/storage - drops the own-auth goal. Running auth on the free plan is
not offered: with every sign-in ~12x over the documented CPU budget,
sign-ins could start failing with Error 1102 at Cloudflare's discretion,
which is exactly why free is not production-ready here.

## Stages

- [x] **0. Prep plumbing** — this folder; auth worker + D1/R2 stub tested.
- [x] **1a. Deployed CPU measurement** — done (see above): the auth
  operation measures ~12x over the free CPU budget; his plan decision
  (paid vs accept risk vs keep Supabase Auth) gates everything below.
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
