/**
 * Cohort API worker - Clerk + Cloudflare direction (PREPARATION).
 *
 * Auth model: Clerk owns sign-up/sign-in/passwords/emails on its free Hobby
 * plan. This worker only VERIFIES session tokens - an asymmetric JWT check
 * (RS256 via WebCrypto) that costs ~2ms CPU, fitting the Workers Free 10ms
 * CPU budget. Verification is networkless: CLERK_JWT_KEY holds Clerk's PEM
 * public key (Dashboard -> API Keys), so no per-request round trip to Clerk.
 *
 * User mapping: app data stays keyed by the existing Supabase UUIDs. Each
 * user's Supabase UUID becomes their Clerk `external_id` on import; this
 * worker reads it from the session-token claims to authorize rows.
 *
 * Authorization (slice 2): Postgres RLS does not exist in D1, so the policies
 * are ported into this file, mirrored from the EFFECTIVE Supabase migration
 * state (see docs/d1-schema-mapping.md for the replay + parity gaps):
 *   posts/likes/comments SELECT : public (posts_read/likes_read/comments_read
 *                                 use `using (true)` - guests included)
 *   profiles SELECT             : authenticated only (NOT public, 0009)
 *   posts INSERT                : active member, author_id = caller,
 *                                 kind='post' unless admin, post_rate_ok()
 *                                 (<10 posts/hour)        (0001 + 0044)
 *   post_likes INSERT           : active member, user_id = caller  (0007)
 *   post_likes DELETE           : user_id = caller only (no admin override)
 *   comments INSERT             : active member, author_id = caller,
 *                                 comment_rate_ok() (<20 comments/10min) (0044)
 *   comments DELETE             : owner or admin               (0001/0013)
 *   bodies on posts/comments    : blocked-terms check (0052, seeded list)
 * is_active_member(): profile exists with status='active' (0007)
 * is_admin()        : role='admin' AND status='active'     (0001)
 * Count upkeep (like_count/comment_count) replaces the PG triggers 0001/0010.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyToken } from '@clerk/backend';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  CLERK_JWT_KEY: string; // PEM public key - not a secret
  CLERK_ISSUER: string; // Frontend API host of the instance
  CORS_ORIGINS?: string;
  CLERK_AUTHORIZED_PARTIES: string; // comma-separated origins allowed as azp
  CLERK_SECRET_KEY?: string; // only for Backend API calls (import script), not verification
};

type Caller = { clerkUserId: string; cohortUserId: string | null };
type Profile = { id: string; full_name: string; role: string; status: string };

const app = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------- auth helpers

async function getCaller(c: {
  req: { header: (n: string) => string | undefined };
  env: Bindings;
}): Promise<Caller | null> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await verifyToken(token, {
      jwtKey: c.env.CLERK_JWT_KEY,
      issuer: c.env.CLERK_ISSUER,
      authorizedParties: c.env.CLERK_AUTHORIZED_PARTIES.split(',').map((s) => s.trim()).filter(Boolean),
    });
    return { clerkUserId: claims.sub, cohortUserId: (claims.external_id as string) ?? null };
  } catch {
    return null;
  }
}

async function getProfile(db: D1Database, id: string): Promise<Profile | null> {
  return db
    .prepare('SELECT id, full_name, role, status FROM profiles WHERE id = ?')
    .bind(id)
    .first<Profile>();
}

const isActiveMember = (p: Profile | null) => !!p && p.status === 'active'; // 0007
const isAdmin = (p: Profile | null) => !!p && p.role === 'admin' && p.status === 'active'; // 0001

// Mirrors 0044 post_rate_ok(): fewer than 10 own posts in the last hour.
async function postRateOk(db: D1Database, authorId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM posts WHERE author_id = ? AND created_at > datetime('now', '-1 hour')")
    .bind(authorId)
    .first<{ c: number }>();
  return (row?.c ?? 0) < 10;
}

// Mirrors 0044 comment_rate_ok(): fewer than 20 own comments in 10 minutes.
async function commentRateOk(db: D1Database, authorId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM comments WHERE author_id = ? AND created_at > datetime('now', '-10 minutes')")
    .bind(authorId)
    .first<{ c: number }>();
  return (row?.c ?? 0) < 20;
}

// 0052 blocked terms (seeded list; the admin-managed blocked_terms table and
// live editing are NOT ported in this slice - parity gap, see mapping doc).
const BLOCKED_TERMS = [
  'chutiya', 'madarchod', 'bhenchod', 'randi', 'harami',
  'nigger', 'faggot', 'whore', 'slut',
  'leaked paper', 'leak paper', 'exam leak', 'answer key leak',
];
const CLEAN_MSG = 'Please keep it respectful - that text is not allowed on Cohort.';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCKED_RES = BLOCKED_TERMS.map(
  (t) => new RegExp(`(?<![\\w])${escapeRe(t).replace(/\s+/g, '\\s+')}(?![\\w])`, 'i'),
);
const isClean = (text: string) => !BLOCKED_RES.some((re) => re.test(text));

// ---------------------------------------------------------------- middleware

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = c.env.CORS_ORIGINS
        ? c.env.CORS_ORIGINS.split(',').map((s: string) => s.trim()).filter(Boolean)
        : ['https://ca.chatare.space', 'http://localhost:8789'];
      return allowed.includes(origin) ? origin : '';
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------- health/probe

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 AS one').first();
  await c.env.FILES.put('prep-health.txt', 'ok');
  const obj = await c.env.FILES.get('prep-health.txt');
  return c.json({ ok: true, service: 'cohort-api-prep', d1: 'ok', r2: obj ? 'ok' : 'mismatch' });
});

app.get('/api/me', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ clerkUserId: caller.clerkUserId, cohortUserId: caller.cohortUserId });
});

// ---------------------------------------------------------------- feed (public)

// posts_read: using (true) - readable by everyone, including guests.
app.get('/api/feed', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, author_id, author_name, author_role, kind, body, image_path, pinned, like_count, comment_count, created_at FROM posts ORDER BY pinned DESC, created_at DESC LIMIT 50',
  ).all();
  return c.json({ posts: results });
});

// comments_read: using (true) - public.
app.get('/api/posts/:id/comments', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, post_id, author_id, body, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 200',
  ).bind(c.req.param('id')).all();
  return c.json({ comments: results });
});

// ---------------------------------------------------------------- posts

// posts_insert (0001 + 0044): caller must be an active member; author_id must
// equal the caller; kind must be 'post' unless admin; post_rate_ok().
app.post('/api/posts', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const profile = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(profile)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);

  const body = await c.req.json<{
    body?: string; kind?: string; author_id?: string; image_path?: string; pinned?: boolean;
  }>().catch(() => null);
  if (!body || typeof body.body !== 'string' || body.body.trim() === '') {
    return c.json({ error: 'invalid', reason: 'body_required' }, 400);
  }
  if (body.author_id !== undefined && body.author_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'author_mismatch' }, 403); // policy with-check violation
  }
  const kind = body.kind ?? 'post';
  if (!['post', 'announcement', 'message'].includes(kind)) {
    return c.json({ error: 'invalid', reason: 'bad_kind' }, 400);
  }
  if (kind !== 'post' && !isAdmin(profile)) {
    return c.json({ error: 'forbidden', reason: 'kind_admin_only' }, 403);
  }
  if (!isClean(body.body)) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
  if (!(await postRateOk(c.env.DB, caller.cohortUserId))) {
    return c.json({ error: 'forbidden', reason: 'rate_limited' }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO posts (id, author_id, author_name, author_role, kind, body, image_path, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    // NOTE: `pinned` is accepted on INSERT because the PG policy does not guard
    // it there (only UPDATE via the posts_guard_flags trigger, 0044) - mirrored
    // as-is and documented as an upstream observation.
    .bind(id, caller.cohortUserId, profile!.full_name, profile!.role, kind, body.body, body.image_path ?? null, body.pinned ? 1 : 0)
    .run();
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return c.json({ post }, 201);
});

// ---------------------------------------------------------------- likes

// likes_insert (0007): active member; user_id = caller (never client-supplied).
app.post('/api/posts/:id/like', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const profile = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(profile)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'not_found' }, 404);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').bind(postId, caller.cohortUserId),
      c.env.DB.prepare('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').bind(postId),
    ]);
  } catch {
    return c.json({ error: 'conflict', reason: 'already_liked' }, 409); // PK (post_id, user_id)
  }
  return c.json({ ok: true });
});

// likes_delete: user_id = caller only. No admin override in the PG policy.
app.delete('/api/posts/:id/like', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);

  const postId = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT 1 AS x FROM post_likes WHERE post_id = ? AND user_id = ?')
    .bind(postId, caller.cohortUserId)
    .first();
  if (!existing) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').bind(postId, caller.cohortUserId),
    c.env.DB.prepare('UPDATE posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?').bind(postId),
  ]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- comments

// comments_insert (0044): active member; author_id = caller; comment_rate_ok().
app.post('/api/posts/:id/comments', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const profile = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(profile)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json<{ body?: string; author_id?: string }>().catch(() => null);
  if (!body || typeof body.body !== 'string' || body.body.trim() === '') {
    return c.json({ error: 'invalid', reason: 'body_required' }, 400);
  }
  if (body.body.length > 2000) return c.json({ error: 'invalid', reason: 'body_too_long' }, 400); // PG CHECK
  if (body.author_id !== undefined && body.author_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'author_mismatch' }, 403);
  }
  if (!isClean(body.body)) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
  if (!(await commentRateOk(c.env.DB, caller.cohortUserId))) {
    return c.json({ error: 'forbidden', reason: 'rate_limited' }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO comments (id, post_id, author_id, body) VALUES (?, ?, ?, ?)')
      .bind(id, postId, caller.cohortUserId, body.body),
    c.env.DB.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').bind(postId),
  ]);
  const comment = await c.env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
  return c.json({ comment }, 201);
});

// comments_delete (0001/0013): owner or admin.
app.delete('/api/comments/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);

  const id = c.req.param('id');
  const comment = await c.env.DB.prepare('SELECT id, post_id, author_id FROM comments WHERE id = ?').bind(id).first<{ id: string; post_id: string; author_id: string }>();
  if (!comment) return c.json({ error: 'not_found' }, 404);
  const profile = await getProfile(c.env.DB, caller.cohortUserId);
  if (comment.author_id !== caller.cohortUserId && !isAdmin(profile)) {
    return c.json({ error: 'forbidden', reason: 'not_owner_or_admin' }, 403);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id),
    c.env.DB.prepare('UPDATE posts SET comment_count = MAX(comment_count - 1, 0) WHERE id = ?').bind(comment.post_id),
  ]);
  return c.json({ ok: true });
});

export default app;
