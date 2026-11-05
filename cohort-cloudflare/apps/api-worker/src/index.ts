/**
 * Preparation stub for Cohort's future API worker.
 * Scope now: prove D1 (app data) and R2 (file storage) bindings work from a
 * Worker, so the full migration plan rests on tested plumbing - not on
 * assumptions. No app tables, no business logic, no production data.
 */
import { Hono } from 'hono';

type Bindings = { DB: D1Database; FILES: R2Bucket };

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 AS one').first();
  await c.env.FILES.put('prep-health.txt', 'ok');
  const obj = await c.env.FILES.get('prep-health.txt');
  const roundTrip = obj ? await obj.text() : null;
  return c.json({ ok: true, service: 'cohort-api-prep', d1: 'ok', r2: roundTrip === 'ok' ? 'ok' : 'mismatch' });
});

export default app;
