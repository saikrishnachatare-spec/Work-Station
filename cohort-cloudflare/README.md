# cohort-cloudflare — Cloudflare stack preparation

Preparation area for moving Cohort's backend from Supabase to the Cloudflare
stack (Workers + D1 + R2) with **Clerk** for auth (his choice, 2026-11-05,
free plans both sides). The earlier self-hosted Better Auth direction is
kept under apps/better-auth-worker (superseded - see its SUPERSEDED.md).

**Status: preparation only. Nothing here is deployed. The live app at
https://ca.chatare.space and the Supabase project are untouched.**

Everything in this folder was developed and tested locally with
`wrangler dev --local` (miniflare). No Cloudflare account resources, no
production data, and no real email delivery are involved.

## Layout

- `apps/api-worker` — future app backend. Verifies Clerk session JWTs
  networklessly (asymmetric verification, far cheaper than hashing;
  deployed free-budget CPU fit not yet measured), plus the D1 (app data) and R2
  (file storage) bindings. **Tested locally: valid/expired/wrong-key/missing
  tokens behave correctly; D1+R2 pass.**
- `apps/better-auth-worker` — SUPERSEDED self-hosted auth direction, kept
  working locally for reference (see its SUPERSEDED.md). Locally tested:
  sign-up, sign-in, sessions, sign-out, and a simulated Supabase-migrated
  user signing in with their existing password.
- `docs/migration-plan.md` — staged plan for the full move, what is proven
  vs. still open.

## Run locally

```bash
cd apps/api-worker
npm install
cp .dev.vars.example .dev.vars   # paste any RSA PEM public key for local testing
npm run dev                      # http://localhost:8789
curl http://localhost:8789/health
```

The superseded Better Auth worker runs the same way on port 8787 from
apps/better-auth-worker (see its folder).

## What is NOT done yet (honest list)

- Deployed CPU measurement 2026-11-05: self-hosted password hashing uses ~12x the documented free CPU budget - that direction was dropped. The active Clerk direction moves hashing to Clerk's infrastructure; deployed CPU check 2026-11-05 (approved, isolated, cleaned up): Clerk token verification costs 1-4 ms CPU per request on the real runtime vs the documented 10 ms free budget - free-plan CPU fit for verification confirmed; the rest of the app remains unmeasured. Real free-Hobby Clerk dev instance now exists (approved) and real Clerk-issued tokens verify correctly in local workerd, including pinned issuer/authorized-party checks (see docs/clerk-integration.md); deployed end-to-end and Expo SDK runs remain unverified. The isolated test resources were deleted after the test.
- Email verification / password reset delivery is stubbed — wiring to Brevo
  (HTTP API; Workers can't do raw SMTP) comes with deployment approval.
- Supabase data export/import script written but not run against production.
- Expo app integration (Better Auth client + expo plugin) not started.
- The big one: Cohort's app data lives in Postgres with RLS policies, RPC
  functions and realtime — replacing those on D1 + Workers is the main
  build effort. This folder only proves the target plumbing works.
