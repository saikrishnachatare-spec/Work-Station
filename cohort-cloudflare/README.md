# cohort-cloudflare — Cloudflare stack preparation

Preparation area for moving Cohort's backend from Supabase to the Cloudflare
stack (Workers + D1 + R2) with self-hosted auth via Better Auth.

**Status: preparation only. Nothing here is deployed. The live app at
https://ca.chatare.space and the Supabase project are untouched.**

Everything in this folder was developed and tested locally with
`wrangler dev --local` (miniflare). No Cloudflare account resources, no
production data, and no real email delivery are involved.

## Layout

- `apps/auth-worker` — Better Auth on a Cloudflare Worker with D1.
  Email/password auth, bcrypt password verification compatible with
  Supabase's existing hashes, Cohort's min-8 password rule, CORS for
  ca.chatare.space. **Tested locally: sign-up, sign-in, sessions, sign-out,
  password rules, and a simulated Supabase-migrated user signing in with
  their existing password.**
- `apps/api-worker` — minimal stub proving the D1 (app data) and R2 (file
  storage) bindings the rest of the migration will use. Health endpoint only;
  no business logic.
- `docs/migration-plan.md` — staged plan for the full move, what is proven
  vs. still open.

## Run locally

```bash
cd apps/auth-worker
npm install
cp .dev.vars.example .dev.vars   # fill in a local secret
npm run dev                      # http://localhost:8787
curl -X POST http://localhost:8787/migrate -H "x-migrate-key: <MIGRATE_KEY from .dev.vars>"
```

The API stub runs the same way on port 8788 (`npm run dev`, then
`curl http://localhost:8788/health`).

## What is NOT done yet (honest list)

- No real D1 database or R2 bucket created (needs approval; free tier).
- Email verification / password reset delivery is stubbed — wiring to Brevo
  (HTTP API; Workers can't do raw SMTP) comes with deployment approval.
- Supabase data export/import script written but not run against production.
- Expo app integration (Better Auth client + expo plugin) not started.
- The big one: Cohort's app data lives in Postgres with RLS policies, RPC
  functions and realtime — replacing those on D1 + Workers is the main
  build effort. This folder only proves the target plumbing works.
