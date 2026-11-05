/**
 * Cohort API worker - Clerk + Cloudflare direction (PREPARATION).
 *
 * Auth model: Clerk owns sign-up/sign-in/passwords/emails on its free Hobby
 * plan. This worker only VERIFIES session tokens - an asymmetric JWT check
 * (RS256 via WebCrypto) that costs ~2ms CPU, fitting the Workers Free 10ms
 * CPU budget. The expensive bcrypt hashing that broke the Better Auth free
 * path never runs here; Clerk does it on its own infrastructure.
 *
 * Verification is networkless: CLERK_JWT_KEY holds Clerk's PEM public key
 * (Dashboard -> API Keys), so no per-request round trip to Clerk.
 *
 * User mapping: our app data stays keyed by the existing Supabase UUIDs.
 * On import, each user's Supabase UUID becomes their Clerk `external_id`;
 * clients send it in the session-token claims, and this worker reads it to
 * authorize rows. (Mapping lookup/caching lands with the real build.)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyToken } from '@clerk/backend';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  CLERK_JWT_KEY: string; // PEM public key - not a secret
  CLERK_ISSUER: string; // Frontend API host of the instance, e.g. https://<slug>.clerk.accounts.dev
  CLERK_AUTHORIZED_PARTIES: string; // comma-separated origins allowed as azp (hosted portal + app origins)
  CLERK_SECRET_KEY?: string; // only needed for Backend API calls (import script), not for verification
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 AS one').first();
  await c.env.FILES.put('prep-health.txt', 'ok');
  const obj = await c.env.FILES.get('prep-health.txt');
  return c.json({ ok: true, service: 'cohort-api-prep', d1: 'ok', r2: obj ? 'ok' : 'mismatch' });
});

app.use(
  '/api/*',
  cors({
    origin: ['https://ca.chatare.space', 'http://localhost:8789'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }),
);

// Prep-stage protected probe: proves token verification + 401 behavior.
// Real Cohort endpoints (posts, profiles, ...) land in the build stages.
app.get('/api/me', async (c) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  try {
    const claims = await verifyToken(token, {
      jwtKey: c.env.CLERK_JWT_KEY,
      issuer: c.env.CLERK_ISSUER,
      authorizedParties: c.env.CLERK_AUTHORIZED_PARTIES.split(',').map((s) => s.trim()).filter(Boolean),
    });
    return c.json({
      clerkUserId: claims.sub,
      cohortUserId: claims.external_id ?? null, // Supabase UUID, once imported
      sessionId: claims.sid ?? null,
    });
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
});

export default app;
