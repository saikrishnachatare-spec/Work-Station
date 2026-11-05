# api-worker

Future Cohort backend on a Cloudflare Worker. Auth is Clerk: the worker
verifies session JWTs networklessly with `CLERK_JWT_KEY` (Clerk's PEM public
key, not a secret) via `@clerk/backend` `verifyToken` - an asymmetric RS256
check that fits the Workers Free CPU budget, unlike self-hosted bcrypt
(see docs/migration-plan.md). `external_id` in the token claims is the
user's Supabase UUID, so existing rows stay attached after import.

## Routes

- `GET /health` - D1 query + R2 put/list/delete smoke check.
- `GET /api/me` - requires `Authorization: Bearer <clerk session token>`,
  returns the verified claims (incl. `external_id`).

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # CLERK_JWT_KEY: any RSA PEM public key for local tests
npm run dev                      # http://localhost:8789
curl http://localhost:8789/health
```

Locally tested 2026-11-05 with a synthetic keypair: valid token -> 200 with
correct claims; missing/expired/wrong-key tokens -> 401; 20 verifications in
~0.13s total; D1+R2 bindings pass. Real Clerk-issued tokens not yet tested
(needs the free Clerk app - pending approval).

Deployment (only with approval): `wrangler secret put CLERK_JWT_KEY`, then
`wrangler deploy`.
