# Clerk + Cloudflare integration (active direction, chosen 2026-11-05)

Why this direction: the deployed CPU test showed bcrypt password hashing
(~126 ms/request) is ~12x over the documented Workers Free 10ms CPU budget
(see migration-plan.md). With Clerk, hashing happens on Clerk's
infrastructure; our Worker only verifies session JWTs - an asymmetric RS256
check (~2 ms class work) that fits the free budget. Both sides stay on free
plans: Cloudflare Workers Free + Clerk Hobby (50,000 monthly retained users,
unlimited applications, no card - https://clerk.com/pricing).

Clerk Hobby limits that apply to Cohort: session lifetime fixed at 7 days
(mobile users re-login weekly), default Clerk-branded emails and hosted
pages, no custom email templates, no MFA (he already declined 2FA).

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
- **User mapping**: imported users keep their Supabase UUID as Clerk
  `external_id`, added to session-token claims (Dashboard -> Sessions ->
  Customize session token). The worker reads `external_id` to authorize
  rows keyed by the old UUIDs - posts/profiles stay attached.

## Locally verified (2026-11-05, wrangler dev / miniflare, synthetic keys)

- Valid token -> 200 with correct claims incl. `external_id` mapping.
- Missing token -> 401. Expired token -> 401. Token signed by a different
  key -> 401. (Negative/authorization probes pass.)
- 20 sequential verifications in ~0.13s total locally (~6 ms each including
  local HTTP overhead) - consistent with the ~2 ms class of asymmetric
  verification, far inside the 10 ms free CPU budget.
- D1 + R2 bindings still pass on the same worker.

Not yet verified (needs a real Clerk app - his approval to create one on the
free Hobby plan):
- End-to-end with real Clerk-issued tokens and the Expo SDK on web + Android.
- Real Supabase export -> Clerk import (format path documented and scripted;
  `scripts/import-users-to-clerk.mjs`, dry-run by default).
- Clerk's 7-day session feel on mobile in practice.

## Cutover notes (when approved)

- Existing sessions end at the switch - everyone signs in once.
- Keep Supabase Auth running read-only during a parallel-test window so a
  rollback only means flipping the app's config flag back.
