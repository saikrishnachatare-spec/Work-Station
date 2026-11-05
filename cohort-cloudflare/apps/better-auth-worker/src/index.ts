import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth, type AuthEnv } from './auth';

type Bindings = AuthEnv & { MIGRATE_KEY: string };

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ ok: true, service: 'cohort-auth-prep' }));

app.use(
  '/api/auth/*',
  cors({
    origin: ['https://ca.chatare.space', 'http://localhost:8787'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }),
);

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

// Applies Better Auth's D1 schema. Guarded by a local key; a real deployment
// would run this once via wrangler or remove this route.
app.post('/migrate', async (c) => {
  if (!c.env.MIGRATE_KEY || c.req.header('x-migrate-key') !== c.env.MIGRATE_KEY) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
    createAuth(c.env).options,
  );
  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    return c.json({ message: 'schema already up to date' });
  }
  await runMigrations();
  return c.json({
    created: toBeCreated.map((t) => t.table),
    added: toBeAdded.map((t) => t.table),
  });
});

export default app;
