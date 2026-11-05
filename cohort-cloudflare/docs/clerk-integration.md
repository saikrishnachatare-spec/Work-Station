# Clerk + Cloudflare integration (active direction, chosen 2026-11-05)

Why this direction: the deployed CPU test showed bcrypt password hashing
(~126 ms/request) is ~12x over the documented Workers Free 10ms CPU budget
(see migration-plan.md). With Clerk, hashing happens on Clerk's
infrastructure; our Worker only verifies session JWTs - an asymmetric RS256
check, much cheaper than bcrypt hashing. Whether it stays inside the
deployed free CPU budget is NOT yet established: our measurements so far
are local wall-time, not deployed Workers CPU time (see below). Both sides stay on free
plans: Cloudflare Workers Free + Clerk Hobby (50,000 monthly retained users,
unlimited applications, no card - https://clerk.com/pricing).

Clerk Hobby limits that apply to Cohort: session lifetime listed as fixed
at 7 days (what that means in practice for mobile re-login depends on
Clerk's session/refresh semantics - to be observed during testing, not
assumed), default Clerk-branded emails and hosted pages, no custom email
templates, no MFA (he already declined 2FA). Free allowance is 50,000 MRU
(monthly retained users, Clerk's current pricing term).

## Architecture

- **Clerk** owns sign-up, sign-in, email verification, password reset,
  sessions. Email sending is Clerk's - the Brevo dependency for auth mail
  goes away.
- **API worker** (`apps/api-worker`) verifies `Authorization: Bearer` tokens
  networklessly with `CLERK_JWT_KEY` (Clerk's PEM public key - not a secret)
  via `@clerk/backend`'s `verifyToken`. No per-request call to Clerk.
  Official references (checked 2026-11-05):
  https://clerk.com/articles/authentication-for-serverless-and-edge-deployments-2
  https://clerk.com/docs/reference/backend/verify-token
- **Expo app** uses the official `@clerk/expo` SDK:
  https://docs.expo.dev/guides/using-clerk/
- **User mapping**: the plan is for imported users to keep their Supabase
  UUID as Clerk `external_id`, added to session-token claims (Dashboard ->
  Sessions -> Customize session token). The worker would read `external_id`
  to look up rows keyed by the old UUIDs. This preserves the identity-
  mapping intent only - that imported users actually get correct ownership/
  authorization over their existing rows must be verified in testing after
  a real import; it is not automatic.

## Locally verified (2026-11-05, wrangler dev / miniflare, synthetic keys)

- Valid token -> 200 with correct claims incl. `external_id` mapping.
- Missing token -> 401. Expired token -> 401. Token signed by a different
  key -> 401. (Negative/authorization probes pass.)
- 20 sequential verifications in ~0.13s total locally. This is local
  miniflare wall time including HTTP overhead - NOT a deployed Workers CPU
  measurement, so it does not by itself prove free-plan CPU fit. A deployed
  CPU check on his account (like the earlier bcrypt test) would be needed
  to establish that; deferred until a real Clerk app exists to test
  against, and would need its own approval for the temporary resource.
- D1 + R2 bindings still pass on the same worker.

Verified against the real free-Hobby dev instance (2026-11-05, test app
"Cohort", instance fond-escargot-8888; still local wrangler dev, NOT deployed):

- Real Clerk-issued session token (RS256, signed by the live instance) ->
  200 with correct claims. Verification stays networkless via the PEM public
  key; no Clerk API round trip per request.
- Missing token -> 401; tampered signature -> 401; same token after its 60s
  TTL -> 401.
- The worker now pins `issuer` (the instance Frontend API host) and
  `authorizedParties` (hosted portal origin) via env bindings
  (CLERK_ISSUER / CLERK_AUTHORIZED_PARTIES). Real token passes with pins;
  the same token is rejected (401) by a worker pinned to different values -
  issuer/authorized-party enforcement is active, not just signature checks.
- `external_id` renders as `null` for a dashboard-created user; the worker
  maps that to `cohortUserId: null` and returns no account data. Nothing is
  exposed when the mapping is unset, and the claim is only meaningful when
  set server-side via the Backend API at import time (client-writable
  metadata is never trusted).

Dev-instance operational facts learned while testing:

- Hosted sign-in lives at `https://<slug>.accounts.dev/sign-in` (the
  `<slug>.clerk.accounts.dev` Frontend API host 404s for pages).
- First sign-in from a new device/browser requires a one-time email code
  even after a correct password - relevant for testing UX and for any headless
  test plan.
- Dashboard "Impersonate user" is a paid feature - not available on Hobby.
- Session tokens are short-lived (~60s) and refreshed client-side; the
  7-day setting governs the session, not each token.
- `external_id` is not editable in the dashboard UI; Backend API only.

Still not verified:

- Expo SDK on web + Android against this instance.
- Real Supabase export -> Clerk import (format path documented and scripted;
  `scripts/import-users-to-clerk.mjs`, dry-run by default; needs
  CLERK_SECRET_KEY, collected via vault link only when that stage is
  approved).
- Deployed Workers CPU measurement of verification (needs approval for the
  temporary resource on his account).
- Clerk's 7-day session feel on mobile in practice.

## Cutover notes (when approved)

- Existing sessions end at the switch - everyone signs in once.
- Keep Supabase Auth running read-only during a parallel-test window so a
  rollback only means flipping the app's config flag back.
