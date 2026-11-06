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
  FILES?: R2Bucket; // absent until R2 billing enrollment is approved (item 4)
  CLERK_JWT_KEY: string; // PEM public key - not a secret
  CLERK_ISSUER: string; // Frontend API host of the instance
  CORS_ORIGINS?: string;
  CLERK_AUTHORIZED_PARTIES: string; // comma-separated origins allowed as azp
  CLERK_SECRET_KEY?: string; // only for Backend API calls (import script), not verification
  TEST_SUB_ALLOWLIST?: string; // PREVIEW-ONLY (item 2): comma-separated synthetic Clerk dev-user subs allowed to bind to a same-id D1 profile row
  PREVIEW_IDENTITY_BINDING?: string; // must be exactly 'enabled' or the allowlist path stays inert
  PREVIEW_DEV_ISSUER?: string; // exact Clerk dev Frontend API URL the allowlist path is pinned to
};

type Caller = { clerkUserId: string; cohortUserId: string | null };
type Profile = { id: string; full_name: string; role: string; status: string; account_type: string };

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
    const sub = claims.sub;
    // Real import path (item 10): external_id set through the Clerk Backend
    // API. Accepted only as a well-formed id string (Clerk user ids /
    // Supabase UUIDs) from the pinned, verified issuer - a malformed or
    // wrong-typed claim is treated as ABSENT, never coerced or trusted.
    const extRaw: unknown = claims.external_id;
    const ext = typeof extRaw === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(extRaw) ? extRaw : null;
    if (ext) return { clerkUserId: sub, cohortUserId: ext };
    // PREVIEW-ONLY explicit binding (item 2, replaces nothing real): the sub
    // must be on the server-controlled TEST_SUB_ALLOWLIST AND have a D1
    // profile row with the same id. No client-supplied id is ever trusted,
    // no auto-provisioning, no other fallback. Anything else gets
    // cohortUserId null, and member-only routes deny it. Item 10 replaces
    // this with the Backend-API external_id mapping for real users.
    // Structurally inert in production: honored only when the pinned issuer
    // is a Clerk DEVELOPMENT instance (*.clerk.accounts.dev hosts; production
    // instances use clerk.<domain> hosts), so the path cannot activate
    // against a production deployment even if the var were set by mistake.
    // Production-inert by construction - ALL of these must hold or the
    // allowlist path fails closed (no binding, no error):
    //   1. explicit opt-in: PREVIEW_IDENTITY_BINDING === 'enabled'
    //   2. exact issuer pin: CLERK_ISSUER === PREVIEW_DEV_ISSUER (string
    //      equality, not a suffix - a look-alike dev instance does not match)
    //   3. the pinned issuer is a Clerk DEVELOPMENT host (*.clerk.accounts.dev;
    //      production instances use clerk.<domain>)
    // A production deployment would need all three misconfigured at once, and
    // a prod CLERK_ISSUER can never equal the pinned dev issuer.
    if (c.env.PREVIEW_IDENTITY_BINDING !== 'enabled') return { clerkUserId: sub, cohortUserId: null };
    if (!c.env.PREVIEW_DEV_ISSUER || c.env.CLERK_ISSUER !== c.env.PREVIEW_DEV_ISSUER)
      return { clerkUserId: sub, cohortUserId: null };
    let issuerIsDev = false;
    try { issuerIsDev = new URL(c.env.CLERK_ISSUER).host.endsWith('.clerk.accounts.dev'); } catch { issuerIsDev = false; }
    if (!issuerIsDev) return { clerkUserId: sub, cohortUserId: null };
    const allowed = (c.env.TEST_SUB_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (sub && allowed.includes(sub)) {
      const row = await c.env.DB.prepare('SELECT 1 AS x FROM profiles WHERE id = ?').bind(sub).first();
      if (row) return { clerkUserId: sub, cohortUserId: sub };
    }
    return { clerkUserId: sub, cohortUserId: null };
  } catch {
    return null;
  }
}

async function getProfile(db: D1Database, id: string): Promise<Profile | null> {
  return db
    .prepare('SELECT id, full_name, role, status, account_type FROM profiles WHERE id = ?')
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

// 0052 blocked terms: admin-managed blocked_terms table (seeded by 0004 with
// the upstream 0052 list). Case-insensitive word-boundary match, same as
// check_clean_text. Live admin edits take effect on the next request.
const CLEAN_MSG = 'Please keep it respectful - that text is not allowed on Cohort.';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function isClean(db: D1Database, text: string): Promise<boolean> {
  const { results } = await db.prepare('SELECT term FROM blocked_terms').all<{ term: string }>();
  return !results.some((t) =>
    new RegExp(`(?<![\\w])${escapeRe(t.term).replace(/\s+/g, '\\s+')}(?![\\w])`, 'i').test(text),
  );
}

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
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------- health/probe

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 AS one').first();
  let r2 = 'unbound'; // R2 binding removed until billing enrollment is approved (item 4)
  if (c.env.FILES) {
    await c.env.FILES.put('prep-health.txt', 'ok');
    const obj = await c.env.FILES.get('prep-health.txt');
    r2 = obj ? 'ok' : 'mismatch';
  }
  return c.json({ ok: true, service: 'cohort-api-prep', d1: 'ok', r2 });
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
  if (!(await isClean(c.env.DB, body.body))) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
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
      c.env.DB.prepare('UPDATE posts SET like_count = (SELECT COUNT(*) FROM post_likes WHERE post_id = ?) WHERE id = ?').bind(postId, postId),
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
  // Delete-then-recompute: if two concurrent unlikes race, only one DELETE
  // reports a change, so the count is recomputed at most once per actual row.
  const del = await c.env.DB.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
    .bind(postId, caller.cohortUserId)
    .run();
  if (!del.meta.changes) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('UPDATE posts SET like_count = (SELECT COUNT(*) FROM post_likes WHERE post_id = ?) WHERE id = ?')
    .bind(postId, postId)
    .run();
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
  if (!(await isClean(c.env.DB, body.body))) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
  if (!(await commentRateOk(c.env.DB, caller.cohortUserId))) {
    return c.json({ error: 'forbidden', reason: 'rate_limited' }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO comments (id, post_id, author_id, body) VALUES (?, ?, ?, ?)')
      .bind(id, postId, caller.cohortUserId, body.body),
    c.env.DB.prepare('UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?').bind(postId, postId),
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
    c.env.DB.prepare('UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?').bind(comment.post_id, comment.post_id),
  ]);
  return c.json({ ok: true });
});


// ================================================================ slice 3
// Messaging (threads/messages/thread_participants) + connections + user_blocks.
// Authorization mirrored from the EFFECTIVE Supabase policies/RPCs (see
// docs/d1-schema-mapping.md slice 3 for sources and parity gaps). Suspension
// deny is NOT blanket: it applies only where the source checks
// is_active_member() - messages_insert, threads_insert, connections_request,
// start_dm. connections_respond/remove, user_blocks CRUD and mark_thread_read
// have NO active-member check upstream - mirrored as-is (observation carried).

type Thread = { id: string; group_id: string | null; created_at: string };

async function isThreadMember(db: D1Database, threadId: string, userId: string): Promise<boolean> {
  const r = await db.prepare('SELECT 1 AS x FROM thread_participants WHERE thread_id = ? AND user_id = ?').bind(threadId, userId).first();
  return !!r;
}
async function isGroupThreadMember(db: D1Database, threadId: string, userId: string): Promise<boolean> {
  const r = await db.prepare(
    'SELECT 1 AS x FROM threads t JOIN group_members gm ON gm.group_id = t.group_id WHERE t.id = ? AND gm.user_id = ?',
  ).bind(threadId, userId).first();
  return !!r;
}
async function isGroupAdmin(db: D1Database, groupId: string, userId: string): Promise<boolean> {
  const r = await db.prepare(
    "SELECT 1 AS x FROM groups g WHERE g.id = ? AND g.created_by = ? UNION SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'",
  ).bind(groupId, userId, groupId, userId).first();
  return !!r;
}
async function hasBlockBetween(db: D1Database, a: string, b: string): Promise<boolean> {
  const r = await db.prepare(
    'SELECT 1 AS x FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
  ).bind(a, b, b, a).first();
  return !!r;
}
async function areConnected(db: D1Database, a: string, b: string): Promise<boolean> {
  const r = await db.prepare(
    "SELECT 1 AS x FROM connections WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
  ).bind(a, b, b, a).first();
  return !!r;
}
// 0044 message_rate_ok(): fewer than 30 own messages in the last minute.
async function messageRateOk(db: D1Database, senderId: string): Promise<boolean> {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND created_at > datetime('now', '-1 minute')").bind(senderId).first<{ c: number }>();
  return (row?.c ?? 0) < 30;
}

// start_dm (final def 0058): auth + active; recipient exists+active; no block;
// gate: admin OR connected OR recipient-admin OR caller firm/enterprise;
// reuse existing 2-person DM thread else create; blank first message opens
// the thread without sending. NOTE: the definer function's message INSERT
// bypasses the messages_insert RLS (no 30/min rate limit) but the
// blocked-terms TRIGGER still fires - mirrored exactly (upstream gap carried).
app.post('/api/dm', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'account_suspended' }, 403);

  const body = await c.req.json<{ other?: string; first?: string }>().catch(() => null);
  if (!body || !body.other || body.other === caller.cohortUserId) {
    return c.json({ error: 'invalid', reason: 'invalid_recipient' }, 400);
  }
  const other = await getProfile(c.env.DB, body.other);
  if (!other || other.status !== 'active') return c.json({ error: 'forbidden', reason: 'recipient_unavailable' }, 403);
  if (await hasBlockBetween(c.env.DB, caller.cohortUserId, body.other)) {
    return c.json({ error: 'forbidden', reason: 'blocked' }, 403);
  }
  const gated =
    isAdmin(me) ||
    (await areConnected(c.env.DB, caller.cohortUserId, body.other)) ||
    other.role === 'admin' ||
    me!.account_type === 'firm' ||
    me!.account_type === 'enterprise';
  if (!gated) {
    return c.json({ error: 'forbidden', reason: 'Connect with this member first - only connections can message each other.' }, 403);
  }

  let thread = await c.env.DB.prepare(
    `SELECT t.id FROM threads t WHERE t.group_id IS NULL
       AND EXISTS (SELECT 1 FROM thread_participants a WHERE a.thread_id = t.id AND a.user_id = ?)
       AND EXISTS (SELECT 1 FROM thread_participants b WHERE b.thread_id = t.id AND b.user_id = ?)
       AND (SELECT COUNT(*) FROM thread_participants c2 WHERE c2.thread_id = t.id) = 2 LIMIT 1`,
  ).bind(caller.cohortUserId, body.other).first<{ id: string }>();
  let created = false;
  if (!thread) {
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO threads (id) VALUES (?)').bind(id),
      c.env.DB.prepare('INSERT INTO thread_participants (thread_id, user_id) VALUES (?, ?), (?, ?)').bind(id, caller.cohortUserId, id, body.other),
    ]);
    thread = { id };
    created = true;
  }
  const first = (body.first ?? '').trim();
  if (first !== '') {
    if (first.length > 4000) return c.json({ error: 'invalid', reason: 'body_too_long' }, 400);
    if (!(await isClean(c.env.DB, first))) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
    await c.env.DB.prepare('INSERT INTO messages (id, thread_id, sender_id, body) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), thread.id, caller.cohortUserId, first).run();
  }
  return c.json({ thread_id: thread.id, created }, created ? 201 : 200);
});

// threads_read (0043) as a list: my DM threads + threads of my groups; admins
// see every thread. Reads have no active-member check (suspended can read).
app.get('/api/threads', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ threads: [] }); // authenticated but unmapped: nothing can match
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  const { results } = isAdmin(me)
    ? await c.env.DB.prepare('SELECT id, group_id, created_at FROM threads ORDER BY created_at DESC LIMIT 200').all<Thread>()
    : await c.env.DB.prepare(
        `SELECT DISTINCT t.id, t.group_id, t.created_at FROM threads t
           LEFT JOIN thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
           LEFT JOIN group_members gm ON gm.group_id = t.group_id AND gm.user_id = ?
           WHERE tp.user_id IS NOT NULL OR gm.user_id IS NOT NULL
           ORDER BY t.created_at DESC LIMIT 200`,
      ).bind(caller.cohortUserId, caller.cohortUserId).all<Thread>();
  const threads = [];
  for (const t of results) {
    const { results: parts } = await c.env.DB.prepare('SELECT user_id FROM thread_participants WHERE thread_id = ?').bind(t.id).all<{ user_id: string }>();
    const mine = await c.env.DB.prepare('SELECT last_read_at FROM thread_participants WHERE thread_id = ? AND user_id = ?').bind(t.id, caller.cohortUserId).first<{ last_read_at: string }>();
    threads.push({ ...t, participants: parts.map((p) => p.user_id), my_last_read_at: mine?.last_read_at ?? null });
  }
  return c.json({ threads });
});

// messages_read (0008): thread member or group-thread member. NO admin
// override in the policy text - mirrored (admin can list a DM thread but
// cannot read its bodies). Non-members (incl. missing threads) get 403, so
// DM existence is not distinguishable - API choice, PG returns empty rows.
app.get('/api/threads/:id/messages', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const id = c.req.param('id');
  const ok = (await isThreadMember(c.env.DB, id, caller.cohortUserId)) || (await isGroupThreadMember(c.env.DB, id, caller.cohortUserId));
  if (!ok) return c.json({ error: 'forbidden', reason: 'not_member' }, 403);
  const { results } = await c.env.DB.prepare(
    'SELECT id, thread_id, sender_id, body, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200',
  ).bind(id).all();
  return c.json({ messages: results });
});

// messages_insert (0045): sender = caller; active member; thread member OR
// (group-thread member AND (kind = group OR group admin)); no block with ANY
// participant; message_rate_ok(); body cap + blocked terms (0044/0052).
app.post('/api/threads/:id/messages', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const threadId = c.req.param('id');
  const thread = await c.env.DB.prepare('SELECT t.id, t.group_id, g.kind AS kind FROM threads t LEFT JOIN groups g ON g.id = t.group_id WHERE t.id = ?')
    .bind(threadId).first<{ id: string; group_id: string | null; kind: string | null }>();
  const member = thread ? await isThreadMember(c.env.DB, threadId, caller.cohortUserId) : false;
  const groupMember = thread ? await isGroupThreadMember(c.env.DB, threadId, caller.cohortUserId) : false;
  let allowed = member;
  if (!allowed && groupMember && thread) {
    const kind = thread.kind ?? 'group';
    allowed = kind === 'group' || (thread.group_id ? await isGroupAdmin(c.env.DB, thread.group_id, caller.cohortUserId) : false);
  }
  if (!thread || !allowed) return c.json({ error: 'forbidden', reason: 'not_member' }, 403);

  const body = await c.req.json<{ body?: string; sender_id?: string }>().catch(() => null);
  if (!body || typeof body.body !== 'string' || body.body.length < 1 || body.body.length > 4000) {
    return c.json({ error: 'invalid', reason: 'body_length_1_4000' }, 400);
  }
  if (body.sender_id !== undefined && body.sender_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'sender_mismatch' }, 403); // with-check violation
  }
  const blocked = await c.env.DB.prepare(
    'SELECT 1 AS x FROM thread_participants p WHERE p.thread_id = ? AND EXISTS (SELECT 1 FROM user_blocks u WHERE (u.blocker_id = ? AND u.blocked_id = p.user_id) OR (u.blocker_id = p.user_id AND u.blocked_id = ?))',
  ).bind(threadId, caller.cohortUserId, caller.cohortUserId).first();
  if (blocked) return c.json({ error: 'forbidden', reason: 'blocked' }, 403);
  if (!(await isClean(c.env.DB, body.body))) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
  if (!(await messageRateOk(c.env.DB, caller.cohortUserId))) {
    return c.json({ error: 'forbidden', reason: 'rate_limited' }, 403);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO messages (id, thread_id, sender_id, body) VALUES (?, ?, ?, ?)')
    .bind(id, threadId, caller.cohortUserId, body.body).run();
  return c.json({ id }, 201);
});

// mark_thread_read (0020): touches ONLY the caller's own participant row.
// No active-member check upstream - suspended members can mark read (mirrored).
app.post('/api/threads/:id/read', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const r = await c.env.DB.prepare("UPDATE thread_participants SET last_read_at = datetime('now') WHERE thread_id = ? AND user_id = ?")
    .bind(c.req.param('id'), caller.cohortUserId).run();
  if (!r.meta.changes) return c.json({ error: 'forbidden', reason: 'not_a_participant' }, 403);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- connections
// connections_read (0053): involved OR accepted (visible to every signed-in
// member) OR admin. No active check on read/respond/remove - mirrored.
app.get('/api/connections', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ connections: [] });
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  const { results } = isAdmin(me)
    ? await c.env.DB.prepare('SELECT * FROM connections ORDER BY created_at DESC LIMIT 500').all()
    : await c.env.DB.prepare(
        "SELECT * FROM connections WHERE requester_id = ? OR addressee_id = ? OR status = 'accepted' ORDER BY created_at DESC LIMIT 500",
      ).bind(caller.cohortUserId, caller.cohortUserId).all();
  return c.json({ connections: results });
});

// connections_request (0053): requester = caller, active member, pending, no
// block, addressee profile active. Pair uniqueness over live states (0060).
app.post('/api/connections', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<{ addressee_id?: string; requester_id?: string }>().catch(() => null);
  if (!body || !body.addressee_id) return c.json({ error: 'invalid', reason: 'addressee_required' }, 400);
  if (body.requester_id !== undefined && body.requester_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'requester_mismatch' }, 403);
  }
  if (body.addressee_id === caller.cohortUserId) return c.json({ error: 'invalid', reason: 'self_connection' }, 400); // PG CHECK
  const other = await getProfile(c.env.DB, body.addressee_id);
  if (!other || other.status !== 'active') return c.json({ error: 'forbidden', reason: 'recipient_unavailable' }, 403);
  if (await hasBlockBetween(c.env.DB, caller.cohortUserId, body.addressee_id)) {
    return c.json({ error: 'forbidden', reason: 'blocked' }, 403);
  }
  try {
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO connections (id, requester_id, addressee_id, status) VALUES (?, ?, ?, 'pending')")
      .bind(id, caller.cohortUserId, body.addressee_id).run();
    return c.json({ id }, 201);
  } catch {
    return c.json({ error: 'conflict', reason: 'pair_already_live' }, 409); // connections_pair_unique
  }
});

// connections_respond (0053): addressee only, pending -> accepted/declined.
// NO is_active_member check upstream - a suspended addressee can still
// respond (mirrored; carried as an upstream observation).
app.post('/api/connections/:id/respond', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const body = await c.req.json<{ action?: string }>().catch(() => null);
  if (!body || !['accept', 'decline'].includes(body.action ?? '')) {
    return c.json({ error: 'invalid', reason: 'action_accept_or_decline' }, 400);
  }
  const conn = await c.env.DB.prepare('SELECT * FROM connections WHERE id = ?').bind(c.req.param('id')).first<{ id: string; addressee_id: string; status: string }>();
  if (!conn) return c.json({ error: 'not_found' }, 404);
  if (conn.addressee_id !== caller.cohortUserId || conn.status !== 'pending') {
    return c.json({ error: 'forbidden', reason: 'not_addressee_or_not_pending' }, 403);
  }
  await c.env.DB.prepare("UPDATE connections SET status = ?, responded_at = datetime('now') WHERE id = ?")
    .bind(body.action === 'accept' ? 'accepted' : 'declined', conn.id).run();
  return c.json({ ok: true });
});

// connections_remove (0053): requester withdraws / either side ends. No
// active-member check upstream - suspended members can clean up (mirrored).
app.delete('/api/connections/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const conn = await c.env.DB.prepare('SELECT requester_id, addressee_id FROM connections WHERE id = ?').bind(c.req.param('id')).first<{ requester_id: string; addressee_id: string }>();
  if (!conn) return c.json({ error: 'not_found' }, 404);
  if (conn.requester_id !== caller.cohortUserId && conn.addressee_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'not_a_party' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- user_blocks
// blocks_own (0016): full CRUD where blocker_id = caller. No active check.
app.get('/api/blocks', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ blocks: [] });
  const { results } = await c.env.DB.prepare('SELECT blocked_id, created_at FROM user_blocks WHERE blocker_id = ?').bind(caller.cohortUserId).all();
  return c.json({ blocks: results });
});
app.post('/api/blocks', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const body = await c.req.json<{ blocked_id?: string; blocker_id?: string }>().catch(() => null);
  if (!body || !body.blocked_id) return c.json({ error: 'invalid', reason: 'blocked_id_required' }, 400);
  if (body.blocker_id !== undefined && body.blocker_id !== caller.cohortUserId) {
    return c.json({ error: 'forbidden', reason: 'blocker_mismatch' }, 403);
  }
  if (body.blocked_id === caller.cohortUserId) return c.json({ error: 'invalid', reason: 'self_block' }, 400); // PG CHECK
  const other = await getProfile(c.env.DB, body.blocked_id);
  if (!other) return c.json({ error: 'not_found', reason: 'no_such_profile' }, 404); // PG FK violation
  try {
    await c.env.DB.prepare('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)').bind(caller.cohortUserId, body.blocked_id).run();
    return c.json({ ok: true }, 201);
  } catch {
    return c.json({ error: 'conflict', reason: 'already_blocked' }, 409);
  }
});
app.delete('/api/blocks/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const r = await c.env.DB.prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?')
    .bind(caller.cohortUserId, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});


// ================================================================ slice 5
// Groups/communities/resources/student_notes/notifications. Rules mirrored
// from the EFFECTIVE policies (docs/d1-schema-mapping.md slice 5). member_count
// upkeep replaces the bump_member_count trigger (absolute recompute in-batch);
// the 0047 caps (1003 members/group, 23 groups/community) replace the cap
// triggers (checked inside the same batch as the insert).

const GROUP_CAP = 1003; // 0047
const COMMUNITY_CAP = 23; // 0047

function recountMembers(db: D1Database, groupId: string): D1PreparedStatement {
  return db.prepare('UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?) WHERE id = ?')
    .bind(groupId, groupId);
}

// groups_read (0001): public. my_role included when a mapped token is sent.
app.get('/api/groups', async (c) => {
  const caller = await getCaller(c);
  const { results } = await c.env.DB.prepare('SELECT id, name, purpose, description, kind, member_count, created_by, created_at FROM groups ORDER BY created_at DESC LIMIT 200').all();
  if (!caller?.cohortUserId) return c.json({ groups: results });
  const mine = await c.env.DB.prepare('SELECT group_id, role FROM group_members WHERE user_id = ?').bind(caller.cohortUserId).all<{ group_id: string; role: string }>();
  const roles = new Map(mine.results.map((r) => [r.group_id, r.role]));
  return c.json({ groups: results.map((g: Record<string, unknown>) => ({ ...g, my_role: roles.get(g.id as string) ?? null })) });
});

// groups_insert (0007): created_by = caller, active member. The app flow adds
// the creator as an admin member - done in the same batch.
app.post('/api/groups', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<{ name?: string; purpose?: string; description?: string; kind?: string; created_by?: string }>().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim() === '') return c.json({ error: 'invalid', reason: 'name_required' }, 400);
  if (body.created_by !== undefined && body.created_by !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'creator_mismatch' }, 403);
  const kind = body.kind ?? 'group';
  if (!['group', 'channel'].includes(kind)) return c.json({ error: 'invalid', reason: 'bad_kind' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO groups (id, name, purpose, description, kind, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.name, body.purpose ?? '', body.description ?? '', kind, caller.cohortUserId),
    c.env.DB.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')").bind(id, caller.cohortUserId),
    recountMembers(c.env.DB, id),
  ]);
  return c.json({ id }, 201);
});

// groups_update (0001) + groups_update_by_group_admin (0036): creator, app
// admin, or group admin.
app.patch('/api/groups/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  const ok = g.created_by === caller.cohortUserId || isAdmin(me) || (await isGroupAdmin(c.env.DB, g.id, caller.cohortUserId));
  if (!ok) return c.json({ error: 'forbidden', reason: 'not_group_manager' }, 403);
  const body = await c.req.json<{ name?: string; purpose?: string; description?: string; kind?: string }>().catch(() => null);
  if (!body) return c.json({ error: 'invalid' }, 400);
  if (body.kind !== undefined && !['group', 'channel'].includes(body.kind)) return c.json({ error: 'invalid', reason: 'bad_kind' }, 400);
  await c.env.DB.prepare('UPDATE groups SET name = COALESCE(?, name), purpose = COALESCE(?, purpose), description = COALESCE(?, description), kind = COALESCE(?, kind) WHERE id = ?')
    .bind(body.name ?? null, body.purpose ?? null, body.description ?? null, body.kind ?? null, g.id).run();
  return c.json({ ok: true });
});

// groups_delete (0001): creator or APP admin only - group admins cannot
// delete (0036 extended update only). Mirrored.
app.delete('/api/groups/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (g.created_by !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_creator_or_admin' }, 403);
  await c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(g.id).run();
  return c.json({ ok: true });
});

// members_insert (0036 self-join path): user = caller, active, role member.
// Cap trigger (0047) replaced by an in-batch count check.
app.post('/api/groups/:id/join', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const g = await c.env.DB.prepare('SELECT id FROM groups WHERE id = ?').bind(c.req.param('id')).first();
  if (!g) return c.json({ error: 'not_found' }, 404);
  const gid = c.req.param('id');
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO group_members (group_id, user_id, role) SELECT ?, ?, 'member' WHERE (SELECT COUNT(*) FROM group_members WHERE group_id = ?) < " + GROUP_CAP)
        .bind(gid, caller.cohortUserId, gid),
      recountMembers(c.env.DB, gid),
    ]);
  } catch {
    return c.json({ error: 'conflict', reason: 'already_member' }, 409);
  }
  const isMember = await isGroupMember2(c.env.DB, gid, caller.cohortUserId);
  if (!isMember) return c.json({ error: 'forbidden', reason: 'This group is full (1003 members).' }, 403);
  return c.json({ ok: true }, 201);
});
async function isGroupMember2(db: D1Database, groupId: string, userId: string): Promise<boolean> {
  const r = await db.prepare('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).first();
  return !!r;
}

// members_delete self path (0001): leave. No active-member check upstream -
// suspended members can leave (mirrored).
app.post('/api/groups/:id/leave', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  const del = await c.env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(gid, caller.cohortUserId).run();
  if (!del.meta.changes) return c.json({ error: 'not_found', reason: 'not_a_member' }, 404);
  await recountMembers(c.env.DB, gid).run();
  return c.json({ ok: true });
});

// members_insert_by_group_admin (0053): group admin adds ANOTHER member;
// role member; target active; app admin OR connected to the target.
app.post('/api/groups/:id/members', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(gid).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found' }, 404);
  if (!(await isGroupAdmin(c.env.DB, gid, caller.cohortUserId))) return c.json({ error: 'forbidden', reason: 'not_group_admin' }, 403);
  const body = await c.req.json<{ user_id?: string }>().catch(() => null);
  if (!body?.user_id) return c.json({ error: 'invalid', reason: 'user_id_required' }, 400);
  if (body.user_id === caller.cohortUserId) return c.json({ error: 'invalid', reason: 'use_join_for_self' }, 400);
  const target = await getProfile(c.env.DB, body.user_id);
  if (!target || target.status !== 'active') return c.json({ error: 'forbidden', reason: 'recipient_unavailable' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isAdmin(me) && !(await areConnected(c.env.DB, caller.cohortUserId, body.user_id))) {
    return c.json({ error: 'forbidden', reason: 'not_connected' }, 403);
  }
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO group_members (group_id, user_id, role) SELECT ?, ?, 'member' WHERE (SELECT COUNT(*) FROM group_members WHERE group_id = ?) < " + GROUP_CAP)
        .bind(gid, body.user_id, gid),
      recountMembers(c.env.DB, gid),
    ]);
  } catch {
    return c.json({ error: 'conflict', reason: 'already_member' }, 409);
  }
  if (!(await isGroupMember2(c.env.DB, gid, body.user_id))) return c.json({ error: 'forbidden', reason: 'This group is full (1003 members).' }, 403);
  return c.json({ ok: true }, 201);
});

// members_delete (0001) + members_delete_by_group_admin (0036): self, app
// admin, or group admin removing another non-creator member.
app.delete('/api/groups/:id/members/:uid', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  const uid = c.req.param('uid');
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(gid).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  const ok =
    uid === caller.cohortUserId ||
    isAdmin(me) ||
    ((await isGroupAdmin(c.env.DB, gid, caller.cohortUserId)) && uid !== caller.cohortUserId && uid !== g.created_by);
  if (!ok) return c.json({ error: 'forbidden', reason: 'cannot_remove_member' }, 403);
  const del = await c.env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(gid, uid).run();
  if (!del.meta.changes) return c.json({ error: 'not_found', reason: 'not_a_member' }, 404);
  await recountMembers(c.env.DB, gid).run();
  return c.json({ ok: true });
});

// members_update_by_group_admin (0036): group admin sets a non-creator
// member's role (promote/demote).
app.patch('/api/groups/:id/members/:uid', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  const uid = c.req.param('uid');
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(gid).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found' }, 404);
  if (!(await isGroupAdmin(c.env.DB, gid, caller.cohortUserId)) || uid === g.created_by) {
    return c.json({ error: 'forbidden', reason: 'not_group_admin' }, 403);
  }
  const body = await c.req.json<{ role?: string }>().catch(() => null);
  if (!body || !['admin', 'member'].includes(body.role ?? '')) return c.json({ error: 'invalid', reason: 'bad_role' }, 400);
  const r = await c.env.DB.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').bind(body.role, gid, uid).run();
  if (!r.meta.changes) return c.json({ error: 'not_found', reason: 'not_a_member' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- invites
// invites_read (0008): group members only.
app.get('/api/groups/:id/invites', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  if (!(await isGroupMember2(c.env.DB, gid, caller.cohortUserId))) return c.json({ error: 'forbidden', reason: 'not_member' }, 403);
  const { results } = await c.env.DB.prepare('SELECT id, token, created_by, created_at FROM group_invites WHERE group_id = ?').bind(gid).all();
  return c.json({ invites: results });
});

// invites_insert (0008): created_by = caller AND group member.
app.post('/api/groups/:id/invites', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  if (!(await isGroupMember2(c.env.DB, gid, caller.cohortUserId))) return c.json({ error: 'forbidden', reason: 'not_member' }, 403);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO group_invites (id, group_id, token, created_by) VALUES (?, ?, ?, ?)').bind(id, gid, token, caller.cohortUserId).run();
  return c.json({ id, token }, 201);
});

// group_by_invite_token (0008): PUBLIC preview - basics only, no member data.
app.get('/api/invites/:token', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT g.id AS group_id, g.name, g.purpose, g.member_count FROM group_invites i JOIN groups g ON g.id = i.group_id WHERE i.token = ?',
  ).bind(c.req.param('token')).first();
  if (!row) return c.json({ error: 'not_found', reason: 'invalid_invite' }, 404);
  return c.json({ group: row });
});

// join_group_by_token (0039 def): auth, active member, invalid -> error,
// idempotent rejoin (on conflict do nothing). Cap trigger replaced in-batch.
app.post('/api/invites/:token/join', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'account_suspended' }, 403);
  const inv = await c.env.DB.prepare('SELECT group_id FROM group_invites WHERE token = ?').bind(c.req.param('token')).first<{ group_id: string }>();
  if (!inv) return c.json({ error: 'not_found', reason: 'invalid_invite' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role) SELECT ?, ?, 'member' WHERE (SELECT COUNT(*) FROM group_members WHERE group_id = ?) < " + GROUP_CAP)
      .bind(inv.group_id, caller.cohortUserId, inv.group_id),
    recountMembers(c.env.DB, inv.group_id),
  ]);
  if (!(await isGroupMember2(c.env.DB, inv.group_id, caller.cohortUserId))) {
    return c.json({ error: 'forbidden', reason: 'This group is full (1003 members).' }, 403);
  }
  return c.json({ group_id: inv.group_id });
});

// ---------------------------------------------------------------- communities
// communities_read / community_groups_read (0045): public.
app.get('/api/communities', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, about, created_by, created_at FROM communities ORDER BY created_at DESC LIMIT 100').all<{ id: string }>();
  const out = [];
  for (const comm of results) {
    const groups = await c.env.DB.prepare(
      'SELECT g.id, g.name, g.kind, g.member_count FROM community_groups cg JOIN groups g ON g.id = cg.group_id WHERE cg.community_id = ?',
    ).bind(comm.id).all();
    out.push({ ...comm, groups: groups.results });
  }
  return c.json({ communities: out });
});

// communities_insert (0045): created_by = caller, active member.
app.post('/api/communities', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<{ name?: string; about?: string; created_by?: string }>().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 120) return c.json({ error: 'invalid', reason: 'name_1_120' }, 400);
  if ((body.about ?? '').length > 1000) return c.json({ error: 'invalid', reason: 'about_too_long' }, 400);
  if (body.created_by !== undefined && body.created_by !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'creator_mismatch' }, 403);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO communities (id, name, about, created_by) VALUES (?, ?, ?, ?)').bind(id, body.name, body.about ?? '', caller.cohortUserId).run();
  return c.json({ id }, 201);
});

// communities_update/delete (0045): creator or app admin.
app.patch('/api/communities/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const comm = await c.env.DB.prepare('SELECT id, created_by FROM communities WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!comm) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (comm.created_by !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_creator_or_admin' }, 403);
  const body = await c.req.json<{ name?: string; about?: string }>().catch(() => null);
  if (!body) return c.json({ error: 'invalid' }, 400);
  if (body.name !== undefined && (body.name.length < 1 || body.name.length > 120)) return c.json({ error: 'invalid', reason: 'name_1_120' }, 400);
  if (body.about !== undefined && body.about.length > 1000) return c.json({ error: 'invalid', reason: 'about_too_long' }, 400);
  await c.env.DB.prepare('UPDATE communities SET name = COALESCE(?, name), about = COALESCE(?, about) WHERE id = ?').bind(body.name ?? null, body.about ?? null, comm.id).run();
  return c.json({ ok: true });
});
app.delete('/api/communities/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const comm = await c.env.DB.prepare('SELECT id, created_by FROM communities WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!comm) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (comm.created_by !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_creator_or_admin' }, 403);
  await c.env.DB.prepare('DELETE FROM communities WHERE id = ?').bind(comm.id).run();
  return c.json({ ok: true });
});

// community_groups_insert (0045): active + (community creator or app admin)
// + (group creator or group admin or app admin). Cap 23 (0047) in-batch.
app.post('/api/communities/:id/groups', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const comm = await c.env.DB.prepare('SELECT id, created_by FROM communities WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!comm) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json<{ group_id?: string }>().catch(() => null);
  if (!body?.group_id) return c.json({ error: 'invalid', reason: 'group_id_required' }, 400);
  const g = await c.env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(body.group_id).first<{ id: string; created_by: string }>();
  if (!g) return c.json({ error: 'not_found', reason: 'no_such_group' }, 404);
  const commOk = comm.created_by === caller.cohortUserId || isAdmin(me);
  const groupOk = g.created_by === caller.cohortUserId || (await isGroupAdmin(c.env.DB, g.id, caller.cohortUserId)) || isAdmin(me);
  if (!commOk || !groupOk) return c.json({ error: 'forbidden', reason: 'not_authorized_for_pair' }, 403);
  try {
    await c.env.DB.prepare('INSERT INTO community_groups (community_id, group_id) SELECT ?, ? WHERE (SELECT COUNT(*) FROM community_groups WHERE community_id = ?) < ' + COMMUNITY_CAP)
      .bind(comm.id, g.id, comm.id).run();
  } catch {
    return c.json({ error: 'conflict', reason: 'already_linked' }, 409);
  }
  const linked = await c.env.DB.prepare('SELECT 1 AS x FROM community_groups WHERE community_id = ? AND group_id = ?').bind(comm.id, g.id).first();
  if (!linked) return c.json({ error: 'forbidden', reason: 'This community is full (23 groups).' }, 403);
  return c.json({ ok: true }, 201);
});

// community_groups_delete (0045): community creator or app admin.
app.delete('/api/communities/:id/groups/:gid', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const comm = await c.env.DB.prepare('SELECT id, created_by FROM communities WHERE id = ?').bind(c.req.param('id')).first<{ id: string; created_by: string }>();
  if (!comm) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (comm.created_by !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_creator_or_admin' }, 403);
  const r = await c.env.DB.prepare('DELETE FROM community_groups WHERE community_id = ? AND group_id = ?').bind(comm.id, c.req.param('gid')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found', reason: 'not_linked' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- resources
// resources_read (0001): public.
app.get('/api/resources', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM resources ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ resources: results });
});

// resources_insert (0046): owner = caller AND app ADMIN - regular members
// cannot add resources upstream (mirrored, notable).
app.post('/api/resources', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isAdmin(me)) return c.json({ error: 'forbidden', reason: 'admin_only' }, 403);
  const body = await c.req.json<{ title?: string; cat?: string; course?: string; subject?: string; meta?: string; owner_id?: string }>().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.trim() === '') return c.json({ error: 'invalid', reason: 'title_required' }, 400);
  if (body.title.length > 300 || (body.meta ?? '').length > 500) return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
  if (body.owner_id !== undefined && body.owner_id !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'owner_mismatch' }, 403);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO resources (id, cat, course, subject, title, uploaded_by, meta, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, body.cat ?? 'Notes', body.course ?? '', body.subject ?? '', body.title, me!.full_name, body.meta ?? '', caller.cohortUserId).run();
  return c.json({ id }, 201);
});

// resources_update/delete (0001): owner or app admin.
for (const method of ['patch', 'delete'] as const) {
  app[method]('/api/resources/:id', async (c) => {
    const caller = await getCaller(c);
    if (!caller) return c.json({ error: 'unauthorized' }, 401);
    if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
    const r = await c.env.DB.prepare('SELECT id, owner_id FROM resources WHERE id = ?').bind(c.req.param('id')).first<{ id: string; owner_id: string }>();
    if (!r) return c.json({ error: 'not_found' }, 404);
    const me = await getProfile(c.env.DB, caller.cohortUserId);
    if (r.owner_id !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_owner_or_admin' }, 403);
    if (method === 'delete') {
      await c.env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(r.id).run();
      return c.json({ ok: true });
    }
    const body = await c.req.json<{ title?: string; cat?: string; course?: string; subject?: string; meta?: string }>().catch(() => null);
    if (!body) return c.json({ error: 'invalid' }, 400);
    if ((body.title ?? '').length > 300 || (body.meta ?? '').length > 500) return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
    await c.env.DB.prepare('UPDATE resources SET title = COALESCE(?, title), cat = COALESCE(?, cat), course = COALESCE(?, course), subject = COALESCE(?, subject), meta = COALESCE(?, meta) WHERE id = ?')
      .bind(body.title ?? null, body.cat ?? null, body.course ?? null, body.subject ?? null, body.meta ?? null, r.id).run();
    return c.json({ ok: true });
  });
}

// ---------------------------------------------------------------- student_notes
// student_notes_read (0046): public.
app.get('/api/student-notes', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM student_notes ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ notes: results });
});

// student_notes_insert (0046): owner = caller AND active member.
app.post('/api/student-notes', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<{ title?: string; subject?: string; meta?: string; owner_id?: string }>().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 300) return c.json({ error: 'invalid', reason: 'title_1_300' }, 400);
  if ((body.subject ?? '').length > 120 || (body.meta ?? '').length > 100) return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
  if (body.owner_id !== undefined && body.owner_id !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'owner_mismatch' }, 403);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO student_notes (id, title, subject, meta, uploader_name, owner_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, body.title, body.subject ?? '', body.meta ?? '', me!.full_name, caller.cohortUserId).run();
  return c.json({ id }, 201);
});

// student_notes_update/delete (0046): owner or app admin.
for (const method of ['patch', 'delete'] as const) {
  app[method]('/api/student-notes/:id', async (c) => {
    const caller = await getCaller(c);
    if (!caller) return c.json({ error: 'unauthorized' }, 401);
    if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
    const n = await c.env.DB.prepare('SELECT id, owner_id, file_path FROM student_notes WHERE id = ?').bind(c.req.param('id')).first<{ id: string; owner_id: string; file_path: string | null }>();
    if (!n) return c.json({ error: 'not_found' }, 404);
    const me = await getProfile(c.env.DB, caller.cohortUserId);
    if (n.owner_id !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_owner_or_admin' }, 403);
    if (method === 'delete') {
      // FAIL CLOSED on byte cleanup (item 2 refinement): a note with a
      // file_path cannot be deleted until R2 byte cleanup lands (item 4) -
      // deleting the row now would orphan storage bytes silently.
      if (n.file_path) return c.json({ error: 'conflict', reason: 'byte_cleanup_deferred_item4' }, 409);
      await c.env.DB.prepare('DELETE FROM student_notes WHERE id = ?').bind(n.id).run();
      return c.json({ ok: true });
    }
    const body = await c.req.json<{ title?: string; subject?: string; meta?: string }>().catch(() => null);
    if (!body) return c.json({ error: 'invalid' }, 400);
    if (body.title !== undefined && (body.title.length < 1 || body.title.length > 300)) return c.json({ error: 'invalid', reason: 'title_1_300' }, 400);
    if ((body.subject ?? '').length > 120 || (body.meta ?? '').length > 100) return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
    await c.env.DB.prepare('UPDATE student_notes SET title = COALESCE(?, title), subject = COALESCE(?, subject), meta = COALESCE(?, meta) WHERE id = ?')
      .bind(body.title ?? null, body.subject ?? null, body.meta ?? null, n.id).run();
    return c.json({ ok: true });
  });
}

// ---------------------------------------------------------------- notifications
// notifications_read_own (0050): own rows only. Inserts stay trigger-side
// (NOT ported - documented behavior gap), so there is no client insert route.
app.get('/api/notifications', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ notifications: [] });
  const { results } = await c.env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(caller.cohortUserId).all();
  return c.json({ notifications: results });
});

// notifications_mark_read (0050): own rows only.
app.post('/api/notifications/:id/read', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const n = await c.env.DB.prepare('SELECT id, user_id FROM notifications WHERE id = ?').bind(c.req.param('id')).first<{ id: string; user_id: string }>();
  if (!n) return c.json({ error: 'not_found' }, 404);
  if (n.user_id !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'not_own_notification' }, 403);
  await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ?").bind(n.id).run();
  return c.json({ ok: true });
});


// ================================================================ slice 4
// jobs / applications / verification / reports / job alerts / error logs /
// admin surfaces. Policies mirrored from the effective Supabase state:
// jobs 0001+0010+0026+0028+0033+0044+0065, applications 0002+0029+0030+0033+0049,
// verification_requests 0056, content_reports 0016, job_alert_prefs 0021,
// error_logs 0006+0044, activity_log/trash 0032+0035, privilege_audit 0018.
// Source-grounded notes:
// - applications SELECT = own OR admin OR poster-of-the-job (0002+0029). Full
//   row is visible to all three (no column masking upstream), which includes
//   resume_path/resume_name METADATA - never exposed on any public route.
// - applications UPDATE: poster ONLY (0030) - not the applicant, not an admin
//   who did not post the job. DELETE: applicant only (no admin override).
// - No last-admin / self-demotion guard exists upstream (profiles_admin FOR
//   ALL, 0001): an admin CAN demote themselves or the last admin. Mirrored.
// - role/status/verified_at are mutable ONLY via /api/admin/members/:id and
//   the verification review path (guard_profile_privileges 0026); no generic
//   profile-update endpoint exists in this worker, so there is no bypass.
// - Notification enqueue side-effects (job_match 0055, application_status,
//   verification review 0056, log_content_activity 0061) are NOT ported.

const JOB_STATUS = ['open', 'closed'] as const;
const APP_STATUS = ['new', 'reviewed', 'shortlisted', 'rejected'] as const;
const REPORT_TARGET = ['post', 'user', 'job'] as const;

async function requireAdmin(c: { req: { header: (n: string) => string | undefined }; env: Bindings; json: (o: unknown, s?: number) => Response }) {
  const caller = await getCaller(c);
  if (!caller) return { error: c.json({ error: 'unauthorized' }, 401) };
  if (!caller.cohortUserId) return { error: c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403) };
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isAdmin(me)) return { error: c.json({ error: 'forbidden', reason: 'admin_only' }, 403) };
  return { caller, me };
}

const isVerifiedMember = (p: Profile | null): p is Profile =>
  !!p && p.status === 'active' && !!(p as Profile & { verified_at?: string | null }).verified_at;

async function getProfileFull(db: D1Database, id: string) {
  return db
    .prepare('SELECT id, full_name, role, status, account_type, verified_at FROM profiles WHERE id = ?')
    .bind(id)
    .first<{ id: string; full_name: string; role: string; status: string; account_type: string; verified_at: string | null }>();
}

async function logActivity(
  db: D1Database,
  actorId: string | null,
  actorName: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  await db
    .prepare('INSERT INTO activity_log (id, actor_id, actor_name, action, entity_type, entity_id, detail) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), actorId, actorName, action, entityType, entityId, JSON.stringify(detail))
    .run();
}

// ---- jobs read (0033: open for everyone incl. anon; own-any-status for the
// poster; everything for admin)
app.get('/api/jobs', async (c) => {
  const caller = await getCaller(c);
  let me: Awaited<ReturnType<typeof getProfileFull>> = null;
  if (caller?.cohortUserId) me = await getProfileFull(c.env.DB, caller.cohortUserId);
  const admin = isAdmin(me as Profile | null);
  const { results } = await c.env.DB.prepare(
    `SELECT j.*, COALESCE(p.full_name, '') AS posted_by_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
       FROM jobs j LEFT JOIN profiles p ON p.id = j.posted_by
      WHERE j.status = 'open' ${caller?.cohortUserId ? 'OR j.posted_by = ?' : ''} ${admin ? 'OR 1=1' : ''}
      ORDER BY j.created_at DESC LIMIT 200`,
  )
    .bind(...(caller?.cohortUserId ? [caller.cohortUserId] : []))
    .all();
  return c.json({ jobs: results });
});

// ---- jobs insert (0026): caller = posted_by, active member, Gig work OR verified
app.post('/api/jobs', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  if (!me || me.status !== 'active') return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  if (body.posted_by !== undefined && body.posted_by !== caller.cohortUserId)
    return c.json({ error: 'forbidden', reason: 'forged_posted_by' }, 403);
  const cat = typeof body.cat === 'string' && body.cat.trim() ? body.cat.trim() : 'Jobs';
  const firm = typeof body.firm === 'string' ? body.firm.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!firm || !role) return c.json({ error: 'invalid', reason: 'firm_and_role_required' }, 400);
  if (cat !== 'Gig work' && !isVerifiedMember(me))
    return c.json({ error: 'forbidden', reason: 'verification_required_for_jobs' }, 403);
  const description = typeof body.description === 'string' ? body.description : '';
  if (description.length > 5000 || role.length > 200 || firm.length > 200)
    return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
  const openings = body.openings === undefined || body.openings === null ? null : Number(body.openings);
  if (openings !== null && (!Number.isInteger(openings) || openings <= 0))
    return c.json({ error: 'invalid', reason: 'openings_must_be_positive' }, 400);
  const status = body.status === undefined ? 'open' : String(body.status);
  if (!(JOB_STATUS as readonly string[]).includes(status))
    return c.json({ error: 'invalid', reason: 'bad_status' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO jobs (id, cat, firm, role, loc, pay, tags, posted_by, description, deadline, status, openings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      id, cat, firm, role,
      typeof body.loc === 'string' ? body.loc : '',
      typeof body.pay === 'string' ? body.pay : '',
      JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : []),
      caller.cohortUserId, description,
      typeof body.deadline === 'string' ? body.deadline : null,
      status, openings,
    )
    .run();
  return c.json({ id }, 201);
});

// ---- jobs update (0028): USING poster-or-admin; WITH CHECK admin OR
// (new.posted_by = caller AND (new.cat = 'Gig work' OR caller verified NOW))
app.patch('/api/jobs/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!job) return c.json({ error: 'not_found' }, 404);
  const admin = isAdmin(me as Profile | null);
  if (!admin && job.posted_by !== caller.cohortUserId) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  const next = {
    cat: body.cat !== undefined ? String(body.cat) : String(job.cat),
    firm: body.firm !== undefined ? String(body.firm) : String(job.firm),
    role: body.role !== undefined ? String(body.role) : String(job.role),
    loc: body.loc !== undefined ? String(body.loc) : String(job.loc),
    pay: body.pay !== undefined ? String(body.pay) : String(job.pay),
    tags: body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : []) : String(job.tags),
    description: body.description !== undefined ? String(body.description) : String(job.description),
    deadline: body.deadline !== undefined ? (body.deadline === null ? null : String(body.deadline)) : (job.deadline as string | null),
    status: body.status !== undefined ? String(body.status) : String(job.status),
    openings: body.openings !== undefined ? (body.openings === null ? null : Number(body.openings)) : (job.openings as number | null),
    posted_by: body.posted_by !== undefined ? String(body.posted_by) : (job.posted_by as string | null),
  };
  if (!(JOB_STATUS as readonly string[]).includes(next.status)) return c.json({ error: 'invalid', reason: 'bad_status' }, 400);
  if (next.description.length > 5000 || next.role.length > 200 || next.firm.length > 200)
    return c.json({ error: 'invalid', reason: 'text_too_long' }, 400);
  if (next.openings !== null && (!Number.isInteger(next.openings) || next.openings <= 0))
    return c.json({ error: 'invalid', reason: 'openings_must_be_positive' }, 400);
  if (!admin && (next.posted_by !== caller.cohortUserId || (next.cat !== 'Gig work' && !isVerifiedMember(me))))
    return c.json({ error: 'forbidden', reason: 'update_gate' }, 403);
  await c.env.DB.prepare(
    'UPDATE jobs SET cat=?, firm=?, role=?, loc=?, pay=?, tags=?, description=?, deadline=?, status=?, openings=?, posted_by=? WHERE id=?',
  )
    .bind(next.cat, next.firm, next.role, next.loc, next.pay, next.tags, next.description, next.deadline, next.status, next.openings, next.posted_by, c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

// ---- jobs delete (0001): poster or admin (direct delete, no trash snapshot;
// the trash path is POST /api/admin/trash)
app.delete('/api/jobs/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  const job = await c.env.DB.prepare('SELECT id, posted_by FROM jobs WHERE id = ?').bind(c.req.param('id')).first<{ id: string; posted_by: string | null }>();
  if (!job) return c.json({ error: 'not_found' }, 404);
  if (!isAdmin(me as Profile | null) && job.posted_by !== caller.cohortUserId) return c.json({ error: 'forbidden' }, 403);
  await c.env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(job.id).run();
  return c.json({ ok: true });
});

// ---- apply (0033): caller = user_id, active member, job open. Dup -> 409.
// Deviation from upstream (user-approved): status forced to 'new' at insert.
app.post('/api/jobs/:id/apply', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  if (!me || me.status !== 'active') return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const open = await c.env.DB.prepare("SELECT 1 AS x FROM jobs WHERE id = ? AND status = 'open'").bind(c.req.param('id')).first();
  if (!open) return c.json({ error: 'forbidden', reason: 'job_not_open' }, 403);
  const body = (await c.req.json<Record<string, unknown>>().catch(() => null)) ?? {};
  // USER-APPROVED FIX (2026-11-06, prep branch only): upstream lets the
  // client pick any enum status at insert (0033 WITH CHECK + 0030 enum), so
  // an applicant can self-insert 'shortlisted'. Here applications always
  // start 'new'; any other client-supplied status is rejected.
  if (body?.status !== undefined && body.status !== 'new')
    return c.json({ error: 'invalid', reason: 'applications_start_new' }, 400);
  if (body?.user_id !== undefined && body.user_id !== caller.cohortUserId)
    return c.json({ error: 'forbidden', reason: 'forged_user_id' }, 403);
  if (body?.job_id !== undefined && body.job_id !== c.req.param('id'))
    return c.json({ error: 'forbidden', reason: 'job_id_mismatch' }, 403);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO applications (id, job_id, user_id, status, resume_path, resume_name) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        id, c.req.param('id'), caller.cohortUserId, 'new',
        typeof body?.resume_path === 'string' ? body.resume_path : null,
        typeof body?.resume_name === 'string' ? body.resume_name : null,
      )
      .run();
  } catch {
    return c.json({ error: 'conflict', reason: 'already_applied' }, 409);
  }
  return c.json({ id }, 201);
});

// ---- applications read: own (0002) / poster (0029) / admin. Full rows -
// no column masking upstream; resume metadata is only ever on these routes.
app.get('/api/applications/mine', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, j.role AS job_role, j.firm AS job_firm, j.status AS job_status
       FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = ? ORDER BY a.created_at DESC`,
  )
    .bind(caller.cohortUserId)
    .all();
  return c.json({ applications: results });
});

app.get('/api/jobs/:id/applications', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  const job = await c.env.DB.prepare('SELECT id, posted_by FROM jobs WHERE id = ?').bind(c.req.param('id')).first<{ id: string; posted_by: string | null }>();
  if (!job) return c.json({ error: 'not_found' }, 404);
  if (!isAdmin(me as Profile | null) && job.posted_by !== caller.cohortUserId) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, COALESCE(p.full_name, '') AS applicant_name
       FROM applications a LEFT JOIN profiles p ON p.id = a.user_id
      WHERE a.job_id = ? ORDER BY a.created_at ASC`,
  )
    .bind(job.id)
    .all();
  return c.json({ applications: results });
});

// ---- application status update (0030): POSTER only + identity guard trigger
app.patch('/api/applications/:id/status', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const appRow = await c.env.DB.prepare(
    'SELECT a.id, a.job_id, a.user_id, j.posted_by FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?',
  )
    .bind(c.req.param('id'))
    .first<{ id: string; job_id: string; user_id: string; posted_by: string | null }>();
  if (!appRow) return c.json({ error: 'not_found' }, 404);
  if (appRow.posted_by !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'not_job_poster' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  // guard_application_identity (0030): identity columns can never change
  if ((body.id !== undefined && body.id !== appRow.id) ||
      (body.job_id !== undefined && body.job_id !== appRow.job_id) ||
      (body.user_id !== undefined && body.user_id !== appRow.user_id))
    return c.json({ error: 'forbidden', reason: 'application_identity_immutable' }, 403);
  const status = String(body.status ?? '');
  if (!(APP_STATUS as readonly string[]).includes(status)) return c.json({ error: 'invalid', reason: 'bad_status' }, 400);
  await c.env.DB.prepare('UPDATE applications SET status = ? WHERE id = ?').bind(status, appRow.id).run();
  return c.json({ ok: true });
});

// ---- application withdraw (0002): applicant ONLY - no admin override upstream
app.delete('/api/applications/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const del = await c.env.DB.prepare('DELETE FROM applications WHERE id = ? AND user_id = ?').bind(c.req.param('id'), caller.cohortUserId).run();
  if (!del.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---- verification requests (0056)
app.post('/api/verification-requests', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  if (!me || me.status !== 'active' || me.verified_at)
    return c.json({ error: 'forbidden', reason: 'not_eligible' }, 403);
  const body = (await c.req.json<Record<string, unknown>>().catch(() => null)) ?? {};
  if (body?.user_id !== undefined && body.user_id !== caller.cohortUserId)
    return c.json({ error: 'forbidden', reason: 'forged_user_id' }, 403);
  if (body?.status !== undefined && body.status !== 'pending')
    return c.json({ error: 'invalid', reason: 'status_must_be_pending' }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO verification_requests (id, user_id, note) VALUES (?,?,?)')
      .bind(id, caller.cohortUserId, typeof body?.note === 'string' ? body.note : '')
      .run();
  } catch {
    return c.json({ error: 'conflict', reason: 'pending_request_exists' }, 409);
  }
  return c.json({ id }, 201);
});

app.get('/api/verification-requests/mine', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM verification_requests WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(caller.cohortUserId)
    .all();
  return c.json({ verification_requests: results });
});

// ---- content reports (0016)
app.post('/api/reports', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfileFull(c.env.DB, caller.cohortUserId);
  if (!me || me.status !== 'active') return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  if (body.reporter_id !== undefined && body.reporter_id !== caller.cohortUserId)
    return c.json({ error: 'forbidden', reason: 'forged_reporter_id' }, 403);
  if (body.status !== undefined && body.status !== 'open')
    return c.json({ error: 'invalid', reason: 'status_must_be_open' }, 400);
  const targetType = String(body.target_type ?? '');
  if (!(REPORT_TARGET as readonly string[]).includes(targetType))
    return c.json({ error: 'invalid', reason: 'bad_target_type' }, 400);
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (reason.length < 5 || reason.length > 2000)
    return c.json({ error: 'invalid', reason: 'reason_length_5_2000' }, 400);
  const targetId = String(body.target_id ?? '');
  if (!targetId) return c.json({ error: 'invalid', reason: 'target_id_required' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason) VALUES (?,?,?,?,?)',
  )
    .bind(id, caller.cohortUserId, targetType, targetId, reason)
    .run();
  return c.json({ id }, 201);
});

app.get('/api/reports/mine', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM content_reports WHERE reporter_id = ? ORDER BY created_at DESC',
  )
    .bind(caller.cohortUserId)
    .all();
  return c.json({ reports: results });
});

// ---- job alert prefs (0021): own row only
app.get('/api/job-alert-prefs', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const row = await c.env.DB.prepare('SELECT * FROM job_alert_prefs WHERE user_id = ?').bind(caller.cohortUserId).first();
  return c.json({ prefs: row ?? null });
});

app.put('/api/job-alert-prefs', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  if (body.user_id !== undefined && body.user_id !== caller.cohortUserId)
    return c.json({ error: 'forbidden', reason: 'forged_user_id' }, 403);
  const keywords = typeof body.keywords === 'string' ? body.keywords : '';
  await c.env.DB.prepare(
    `INSERT INTO job_alert_prefs (user_id, keywords, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT (user_id) DO UPDATE SET keywords = excluded.keywords, updated_at = datetime('now')`,
  )
    .bind(caller.cohortUserId, keywords)
    .run();
  // 0021 shape: the app upserts last_seen_at when the member has seen the
  // current job-match state (useSaveJobAlert markSeen).
  if (body.mark_seen === true)
    await c.env.DB.prepare("UPDATE job_alert_prefs SET last_seen_at = datetime('now') WHERE user_id = ?").bind(caller.cohortUserId).run();
  return c.json({ ok: true });
});

// ---- error logs (0006+0044): PUBLIC insert, dual rate limit, sanitize.
// USER-APPROVED FIX (2026-11-06, prep branch only): upstream stores whatever
// user_id the client sends (rate-limit evasion + log forging). Here user_id
// is always the verified caller identity (null when anonymous); any
// client-supplied user_id is ignored.
app.post('/api/error-logs', async (c) => {
  const caller = await getCaller(c);
  const identity = caller ? (caller.cohortUserId ?? `clerk:${caller.clerkUserId}`) : null;
  const lim = identity ? 10 : 30;
  const { c: recent } = identity
    ? await c.env.DB.prepare(
        "SELECT COUNT(*) AS c FROM error_logs WHERE user_id = ? AND created_at > datetime('now', '-1 minute')",
      ).bind(identity).first<{ c: number }>().then((r) => ({ c: r?.c ?? 0 }))
    : await c.env.DB.prepare(
        "SELECT COUNT(*) AS c FROM error_logs WHERE user_id IS NULL AND created_at > datetime('now', '-1 minute')",
      ).first<{ c: number }>().then((r) => ({ c: r?.c ?? 0 }));
  if (recent >= lim) return c.json({ error: 'forbidden', reason: 'rate_limited' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.message !== 'string' || !body.message)
    return c.json({ error: 'invalid', reason: 'message_required' }, 400);
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
  await c.env.DB.prepare(
    'INSERT INTO error_logs (id, user_id, message, stack, url, user_agent) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      crypto.randomUUID(),
      identity,
      body.message.slice(0, 2000),
      cut(body.stack, 8000),
      cut(body.url, 1000),
      cut(body.user_agent, 500) ?? cut(c.req.header('User-Agent'), 500),
    )
    .run();
  return c.json({ ok: true }, 201);
});

// ================================================== admin-only surfaces

// ---- verification review (0056 review_verification_request)
app.get('/api/admin/verification-requests', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const status = c.req.query('status');
  const filter = status && ['pending', 'approved', 'rejected'].includes(status) ? 'WHERE v.status = ?' : '';
  const { results } = await c.env.DB.prepare(
    `SELECT v.*, COALESCE(p.full_name, '') AS user_name
       FROM verification_requests v LEFT JOIN profiles p ON p.id = v.user_id
      ${filter} ORDER BY v.created_at ASC`,
  )
    .bind(...(filter ? [status as string] : []))
    .all();
  return c.json({ verification_requests: results });
});

app.post('/api/admin/verification-requests/:id/review', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const body = await c.req.json<{ approve?: boolean }>().catch(() => null);
  if (!body || typeof body.approve !== 'boolean') return c.json({ error: 'invalid', reason: 'approve_boolean_required' }, 400);
  const vr = await c.env.DB.prepare("SELECT id, user_id FROM verification_requests WHERE id = ? AND status = 'pending'")
    .bind(c.req.param('id'))
    .first<{ id: string; user_id: string }>();
  if (!vr) return c.json({ error: 'not_found', reason: 'request_not_found' }, 404);
  const stmts = [
    c.env.DB.prepare("UPDATE verification_requests SET status = ?, responded_at = datetime('now') WHERE id = ?")
      .bind(body.approve ? 'approved' : 'rejected', vr.id),
  ];
  if (body.approve)
    stmts.push(c.env.DB.prepare("UPDATE profiles SET verified_at = datetime('now') WHERE id = ?").bind(vr.user_id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ---- reports review (0016 reports_review)
app.get('/api/admin/reports', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, COALESCE(p.full_name, '') AS reporter_name
       FROM content_reports r LEFT JOIN profiles p ON p.id = r.reporter_id
      ORDER BY r.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ reports: results });
});

app.patch('/api/admin/reports/:id', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  const status = String(body.status ?? '');
  if (!['open', 'reviewed'].includes(status)) return c.json({ error: 'invalid', reason: 'bad_status' }, 400);
  const r = await c.env.DB.prepare('UPDATE content_reports SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---- blocked terms (0052): admin read + write
app.get('/api/admin/blocked-terms', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare('SELECT * FROM blocked_terms ORDER BY term').all();
  return c.json({ blocked_terms: results });
});

app.post('/api/admin/blocked-terms', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const body = await c.req.json<{ term?: string }>().catch(() => null);
  const term = body?.term?.trim().toLowerCase();
  if (!term) return c.json({ error: 'invalid', reason: 'term_required' }, 400);
  await c.env.DB.prepare('INSERT OR IGNORE INTO blocked_terms (term) VALUES (?)').bind(term).run();
  return c.json({ ok: true }, 201);
});

app.delete('/api/admin/blocked-terms/:term', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const r = await c.env.DB.prepare('DELETE FROM blocked_terms WHERE term = ?').bind(c.req.param('term')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---- error logs admin (0006)
app.get('/api/admin/error-logs', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ error_logs: results });
});

app.delete('/api/admin/error-logs/:id', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const r = await c.env.DB.prepare('DELETE FROM error_logs WHERE id = ?').bind(c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---- member privilege management (profiles_admin 0001 + guard 0026 + audit 0018).
// Only role/status here; verified_at changes flow through verification review.
// Upstream has NO last-admin guard; this worker adds one (user-approved fix):
// self-demotion and demoting other admins stay allowed while another active
// admin exists, but the LAST active admin cannot be stripped.
app.patch('/api/admin/members/:id', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { caller } = gate as { caller: Caller };
  const target = await getProfileFull(c.env.DB, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);
  const role = body.role === undefined ? target.role : String(body.role);
  const status = body.status === undefined ? target.status : String(body.status);
  if (!['user', 'admin'].includes(role)) return c.json({ error: 'invalid', reason: 'bad_role' }, 400);
  if (!['active', 'suspended', 'deleted'].includes(status)) return c.json({ error: 'invalid', reason: 'bad_status' }, 400);
  if (body.verified_at !== undefined)
    return c.json({ error: 'invalid', reason: 'verified_at_via_verification_review_only' }, 400);
  // USER-APPROVED FIX (2026-11-06, prep branch only): upstream has no
  // last-admin guard. Here a change that would strip the target's ACTIVE
  // admin standing (role or status) is refused when no OTHER active admin
  // exists. The guard lives INSIDE the UPDATE statement (single statement,
  // executed under SQLite's write lock) - not a preflight COUNT - so two
  // concurrent demotions of the last two admins cannot both pass.
  const targetIsActiveAdmin = target.role === 'admin' && target.status === 'active';
  const losesActiveAdmin = role !== 'admin' || status !== 'active';
  if (targetIsActiveAdmin && losesActiveAdmin) {
    const guarded = await c.env.DB.prepare(
      `UPDATE profiles SET role = ?, status = ? WHERE id = ?
         AND EXISTS (SELECT 1 FROM profiles WHERE role = 'admin' AND status = 'active' AND id <> ?)`,
    ).bind(role, status, target.id, target.id).run();
    if (!guarded.meta.changes)
      return c.json({ error: 'conflict', reason: 'last_active_admin' }, 409);
  } else {
    await c.env.DB.prepare('UPDATE profiles SET role = ?, status = ? WHERE id = ?').bind(role, status, target.id).run();
  }
  if (role !== target.role || status !== target.status)
    await c.env.DB.prepare(
      'INSERT INTO privilege_audit (actor_id, target_id, old_role, new_role, old_status, new_status) VALUES (?,?,?,?,?,?)',
    ).bind(caller.cohortUserId, target.id, target.role, role, target.status, status).run();
  return c.json({ ok: true });
});

// ---- admin read-only surfaces (0032 / 0018)
app.get('/api/admin/activity-log', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ activity: results });
});

app.get('/api/admin/privilege-audit', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare('SELECT * FROM privilege_audit ORDER BY changed_at DESC LIMIT 200').all();
  return c.json({ privilege_audit: results });
});

app.get('/api/admin/trash', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { results } = await c.env.DB.prepare('SELECT * FROM trash ORDER BY trashed_at DESC LIMIT 200').all();
  return c.json({ trash: results });
});

// ---- admin trash / restore / purge (0035). FK/ownership handling mirrors
// admin_restore: ownership passes to the restoring admin when the original
// owner is gone or deleted; dependents re-insert on-conflict-skip AFTER the
// parent row so parent/child foreign keys hold; the whole restore is one
// batch (transaction) so an FK failure rolls back like the PG exception.
const TRASHABLE = ['posts', 'jobs', 'resources'] as const;
const OWNER_COL: Record<string, string> = { posts: 'author_id', jobs: 'posted_by', resources: 'owner_id' };

app.post('/api/admin/trash', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { caller, me } = gate as { caller: Caller; me: Profile };
  const body = await c.req.json<{ table?: string; id?: string }>().catch(() => null);
  const table = String(body?.table ?? '');
  if (!(TRASHABLE as readonly string[]).includes(table))
    return c.json({ error: 'invalid', reason: 'unsupported_table' }, 400);
  const entityId = String(body?.id ?? '');
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(entityId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const payload: Record<string, unknown> = { ...row };
  if (table === 'jobs')
    payload._applications = (await c.env.DB.prepare('SELECT * FROM applications WHERE job_id = ?').bind(entityId).all()).results;
  if (table === 'posts') {
    payload._comments = (await c.env.DB.prepare('SELECT * FROM comments WHERE post_id = ?').bind(entityId).all()).results;
    payload._likes = (await c.env.DB.prepare('SELECT * FROM post_likes WHERE post_id = ?').bind(entityId).all()).results;
  }
  const tid = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(entityId),
    c.env.DB.prepare('INSERT INTO trash (id, entity_table, entity_id, payload, trashed_by, trashed_by_name) VALUES (?,?,?,?,?,?)')
      .bind(tid, table, entityId, JSON.stringify(payload), caller.cohortUserId, me.full_name ?? ''),
  ]);
  await logActivity(c.env.DB, caller.cohortUserId, me.full_name ?? '', `${table}_trashed`, table, entityId, {
    title: (payload.title as string) || (payload.role as string) || String(payload.body ?? '').slice(0, 80),
  });
  return c.json({ id: tid }, 201);
});

app.post('/api/admin/trash/:tid/restore', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { caller, me } = gate as { caller: Caller; me: Profile };
  const t = await c.env.DB.prepare('SELECT * FROM trash WHERE id = ? AND restored_at IS NULL').bind(c.req.param('tid'))
    .first<{ id: string; entity_table: string; entity_id: string; payload: string }>();
  if (!t) return c.json({ error: 'not_found' }, 404);
  const full = JSON.parse(t.payload) as Record<string, unknown>;
  const deps = {
    applications: (full._applications ?? []) as Record<string, unknown>[],
    comments: (full._comments ?? []) as Record<string, unknown>[],
    likes: (full._likes ?? []) as Record<string, unknown>[],
  };
  delete full._applications; delete full._comments; delete full._likes;
  // ownership: gone/deleted owner -> restoring admin takes ownership (0035)
  const ownerCol = OWNER_COL[t.entity_table];
  const owner = full[ownerCol];
  const ownerAlive = typeof owner === 'string' &&
    (await c.env.DB.prepare("SELECT 1 AS x FROM profiles WHERE id = ? AND status <> 'deleted'").bind(owner).first());
  if (!ownerAlive) full[ownerCol] = caller.cohortUserId;
  const cols = Object.keys(full);
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO ${t.entity_table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .bind(...cols.map((k) => full[k] as string | number | null)),
  ];
  const depSpec: [Record<string, unknown>[], string][] = [];
  if (t.entity_table === 'jobs') depSpec.push([deps.applications, 'applications']);
  if (t.entity_table === 'posts') {
    depSpec.push([deps.comments, 'comments'], [deps.likes, 'post_likes']);
  }
  for (const [rows, tbl] of depSpec)
    for (const d of rows) {
      const dcols = Object.keys(d);
      stmts.push(
        c.env.DB.prepare(`INSERT OR IGNORE INTO ${tbl} (${dcols.join(',')}) VALUES (${dcols.map(() => '?').join(',')})`)
          .bind(...dcols.map((k) => d[k] as string | number | null)),
      );
    }
  stmts.push(c.env.DB.prepare("UPDATE trash SET restored_at = datetime('now') WHERE id = ?").bind(t.id));
  try {
    await c.env.DB.batch(stmts);
  } catch {
    return c.json({ error: 'conflict', reason: 'restore_failed_fk_or_conflict' }, 409);
  }
  await logActivity(c.env.DB, caller.cohortUserId, me.full_name ?? '', `${t.entity_table}_restored`, t.entity_table, t.entity_id, {
    title: (full.title as string) || (full.role as string) || String(full.body ?? '').slice(0, 80),
  });
  return c.json({ ok: true });
});

app.post('/api/admin/trash/:tid/purge', async (c) => {
  const gate = await requireAdmin(c);
  if ('error' in gate) return gate.error;
  const { caller, me } = gate as { caller: Caller; me: Profile };
  const t = await c.env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(c.req.param('tid'))
    .first<{ id: string; entity_table: string; entity_id: string; payload: string }>();
  if (!t) return c.json({ error: 'not_found' }, 404);
  // fail-closed mirror of the storage_cleanup_required guard: resource bytes
  // are not ported (no bucket), so a trashed resource with a file_path can
  // never be verified clean - refuse its purge outright.
  const payload = JSON.parse(t.payload) as Record<string, unknown>;
  if (t.entity_table === 'resources' && typeof payload.file_path === 'string' && payload.file_path.length > 0)
    return c.json({ error: 'conflict', reason: 'storage_cleanup_required' }, 409);
  await c.env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(t.id).run();
  await logActivity(c.env.DB, caller.cohortUserId, me.full_name ?? '', `${t.entity_table}_purged`, t.entity_table, t.entity_id, {
    title: (payload.title as string) || (payload.role as string) || String(payload.body ?? '').slice(0, 80),
  });
  return c.json({ ok: true });
});

// ================================================================ item 2
// App-rewire endpoint additions. Guards mirror the EFFECTIVE Supabase policy
// state named on each route; nothing is widened past the source policy.

// ---- profile JSON helpers (0048 columns stored as JSON text in D1)
function parseJsonArray(v: unknown): unknown[] {
  if (typeof v !== 'string') return [];
  try { const p: unknown = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}
const PROFILE_COLS =
  'id, full_name, role, status, course, level, avatar_path, verified_at, account_type, org_name, city, headline, bio, links, skills, experience, education, created_at';
function rowToProfile(r: Record<string, unknown>) {
  return {
    ...r,
    links: parseJsonArray(r.links),
    skills: parseJsonArray(r.skills),
    experience: parseJsonArray(r.experience),
    education: parseJsonArray(r.education),
  };
}

// ---------------------------------------------------------------- profiles
// profiles_read (0009): authenticated only - NOT public. A valid Clerk token
// mirrors auth.role()='authenticated'; a mapped user is not required to read.
app.get('/api/profiles', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  const { results } = await c.env.DB.prepare(`SELECT ${PROFILE_COLS} FROM profiles ORDER BY created_at DESC LIMIT 500`).all();
  return c.json({ profiles: (results as Record<string, unknown>[]).map(rowToProfile) });
});

app.get('/api/profiles/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  const r = await c.env.DB.prepare(`SELECT ${PROFILE_COLS} FROM profiles WHERE id = ?`).bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json({ profile: rowToProfile(r) });
});

// profiles update (0001 RLS + guard_profile_privileges 0015/0017): non-admins
// edit ONLY their own row and can never change role/status/id/account_type.
// Admins may edit anyone's ordinary fields here; privilege fields stay on the
// admin route (0023 last-admin guard) and are rejected here for everyone.
app.patch('/api/profiles/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const id = c.req.param('id');
  const admin = isAdmin(me);
  if (!admin && id !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'not_owner' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'invalid' }, 400);
  if ('role' in body || 'status' in body || 'id' in body || 'account_type' in body)
    return c.json({ error: 'forbidden', reason: 'privilege_fields_admin_only' }, 403);
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const arrOf = (v: unknown, max: number, itemOk: (x: unknown) => boolean) => Array.isArray(v) && v.length <= max && v.every(itemOk);
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const setStr = (col: string, v: unknown, max: number) => {
    if (v === undefined) return true;
    if (!str(v, max)) return false;
    sets.push(`${col} = ?`); vals.push((v as string).trim()); return true;
  };
  const setJson = (col: string, v: unknown, max: number, itemOk: (x: unknown) => boolean) => {
    if (v === undefined) return true;
    if (!arrOf(v, max, itemOk)) return false;
    sets.push(`${col} = ?`); vals.push(JSON.stringify(v)); return true;
  };
  const linkOk = (x: unknown) => !!x && typeof x === 'object' && str((x as { label?: unknown }).label, 80) && str((x as { url?: unknown }).url, 500) && /^https?:\/\//i.test((x as { url: string }).url);
  const expOk = (x: unknown) => !!x && typeof x === 'object' && Object.values(x as Record<string, unknown>).every((v) => typeof v === 'string' && v.length <= 200);
  if (!setStr('full_name', body.full_name, 200)) return c.json({ error: 'invalid', reason: 'full_name' }, 400);
  if (!setStr('headline', body.headline, 120)) return c.json({ error: 'invalid', reason: 'headline' }, 400);
  if (!setStr('bio', body.bio, 2000)) return c.json({ error: 'invalid', reason: 'bio' }, 400);
  if (!setStr('city', body.city, 200)) return c.json({ error: 'invalid', reason: 'city' }, 400);
  if (!setStr('org_name', body.org_name, 200)) return c.json({ error: 'invalid', reason: 'org_name' }, 400);
  if (body.course !== undefined) {
    if (!['', 'CA', 'CMA', 'CS'].includes(body.course as string)) return c.json({ error: 'invalid', reason: 'course' }, 400);
    sets.push('course = ?'); vals.push(body.course as string);
  }
  if (body.level !== undefined) {
    if (!['', 'Foundation', 'Inter', 'Final'].includes(body.level as string)) return c.json({ error: 'invalid', reason: 'level' }, 400);
    sets.push('level = ?'); vals.push(body.level as string);
  }
  if (body.avatar_path !== undefined) {
    if (body.avatar_path !== null && !str(body.avatar_path, 500)) return c.json({ error: 'invalid', reason: 'avatar_path' }, 400);
    sets.push('avatar_path = ?'); vals.push(body.avatar_path as string | null);
  }
  if (!setJson('links', body.links, 5, linkOk)) return c.json({ error: 'invalid', reason: 'links' }, 400);
  if (!setJson('skills', body.skills, 15, (x) => typeof x === 'string' && x.length <= 40)) return c.json({ error: 'invalid', reason: 'skills' }, 400);
  if (!setJson('experience', body.experience, 10, expOk)) return c.json({ error: 'invalid', reason: 'experience' }, 400);
  if (!setJson('education', body.education, 10, expOk)) return c.json({ error: 'invalid', reason: 'education' }, 400);
  if (!sets.length) return c.json({ error: 'invalid', reason: 'nothing_to_update' }, 400);
  vals.push(id);
  const r = await c.env.DB.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- groups
// groups_read (0001): public.
app.get('/api/groups/:id', async (c) => {
  const g = await c.env.DB.prepare('SELECT id, name, purpose, description, kind, member_count, created_by, created_at FROM groups WHERE id = ?')
    .bind(c.req.param('id')).first();
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json({ group: g });
});

// members_read (0001, restated 0036): public.
app.get('/api/groups/:id/members', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT gm.user_id, gm.role, COALESCE(p.full_name, '') AS full_name, p.avatar_path
       FROM group_members gm LEFT JOIN profiles p ON p.id = gm.user_id
      WHERE gm.group_id = ? ORDER BY gm.role = 'admin' DESC, p.full_name ASC LIMIT 1100`,
  ).bind(c.req.param('id')).all();
  return c.json({ members: results });
});

// Group thread get-or-create: read requires group membership (0043
// threads_read); creation requires active member + group member (0043
// threads_insert - group threads only, DM threads stay behind start_dm).
app.get('/api/groups/:id/thread', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const gid = c.req.param('id');
  if (!(await isGroupMember2(c.env.DB, gid, caller.cohortUserId))) return c.json({ error: 'forbidden', reason: 'not_group_member' }, 403);
  const existing = await c.env.DB.prepare('SELECT id FROM threads WHERE group_id = ?').bind(gid).first<{ id: string }>();
  if (existing) return c.json({ threadId: existing.id });
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (!isActiveMember(me)) return c.json({ error: 'forbidden', reason: 'not_active_member' }, 403);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO threads (id, group_id) VALUES (?, ?)').bind(id, gid).run();
  return c.json({ threadId: id });
});

// ---------------------------------------------------------------- posts
// posts_read (0001): public.
app.get('/api/posts/:id', async (c) => {
  const p = await c.env.DB.prepare(
    'SELECT id, author_id, author_name, author_role, kind, body, image_path, pinned, like_count, comment_count, created_at FROM posts WHERE id = ?',
  ).bind(c.req.param('id')).first();
  if (!p) return c.json({ error: 'not_found' }, 404);
  return c.json({ post: p });
});

// posts_update (0001): owner or admin. Body re-checked against blocked terms
// (0052), same as insert.
app.patch('/api/posts/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const p = await c.env.DB.prepare('SELECT id, author_id FROM posts WHERE id = ?').bind(c.req.param('id')).first<{ id: string; author_id: string }>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (p.author_id !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_owner' }, 403);
  const body = await c.req.json<{ body?: string }>().catch(() => null);
  const text = body?.body?.trim();
  if (!text || text.length > 4000) return c.json({ error: 'invalid', reason: 'body' }, 400);
  if (!(await isClean(c.env.DB, text))) return c.json({ error: 'blocked', message: CLEAN_MSG }, 422);
  await c.env.DB.prepare('UPDATE posts SET body = ? WHERE id = ?').bind(text, p.id).run();
  return c.json({ ok: true });
});

// posts_delete (0001): owner or admin. FAIL CLOSED on byte cleanup: a post
// with an image_path cannot be deleted until R2 byte cleanup lands (item 4) -
// deleting the row now would orphan storage bytes silently. No-image posts
// delete normally; likes/comments cascade.
app.delete('/api/posts/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const p = await c.env.DB.prepare('SELECT id, author_id, image_path FROM posts WHERE id = ?').bind(c.req.param('id'))
    .first<{ id: string; author_id: string; image_path: string | null }>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  const me = await getProfile(c.env.DB, caller.cohortUserId);
  if (p.author_id !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_owner' }, 403);
  if (p.image_path) return c.json({ error: 'conflict', reason: 'byte_cleanup_deferred_item4' }, 409);
  await c.env.DB.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(p.id).run();
  await c.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(p.id).run();
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(p.id).run();
  return c.json({ ok: true });
});

// comments_update_own (0013): owner ONLY - no admin override. Blocked-terms
// re-check (0052), same as insert.
app.patch('/api/comments/:id', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const cm = await c.env.DB.prepare('SELECT id, author_id FROM comments WHERE id = ?').bind(c.req.param('id')).first<{ id: string; author_id: string }>();
  if (!cm) return c.json({ error: 'not_found' }, 404);
  if (cm.author_id !== caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'not_owner' }, 403);
  const body = await c.req.json<{ body?: string }>().catch(() => null);
  const text = body?.body?.trim();
  if (!text || text.length > 2000) return c.json({ error: 'invalid', reason: 'body' }, 400);
  if (!(await isClean(c.env.DB, text))) return c.json({ error: 'blocked', message: CLEAN_MSG }, 422);
  await c.env.DB.prepare('UPDATE comments SET body = ? WHERE id = ?').bind(text, cm.id).run();
  return c.json({ ok: true });
});

// notifications_mark_read (0050): own rows only. Inserts stay trigger-side
// (item 5) - there is still no client notification-insert route.
app.post('/api/notifications/read-all', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ error: 'forbidden', reason: 'no_mapped_user' }, 403);
  const r = await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL")
    .bind(caller.cohortUserId).run();
  return c.json({ ok: true, updated: r.meta.changes ?? 0 });
});

// ---------------------------------------------------------------- search
// Per-entity guards mirror the standalone routes: posts/resources/groups
// public (using(true) policies), jobs mirror GET /api/jobs (open + own +
// admin-all), people authenticated-only (0009) - unauthenticated callers get
// no people results, exactly as RLS would return zero rows.
app.get('/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().replace(/[%_,().\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return c.json({ posts: [], resources: [], groups: [], jobs: [], people: [] });
  const like = `%${q}%`;
  const caller = await getCaller(c);
  let searchAdmin = false;
  if (caller?.cohortUserId) searchAdmin = isAdmin(await getProfile(c.env.DB, caller.cohortUserId));
  const [posts, resources, groups, jobs, people] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, author_id, author_name, author_role, kind, body, image_path, pinned, like_count, comment_count, created_at FROM posts WHERE body LIKE ? OR author_name LIKE ? ORDER BY created_at DESC LIMIT 20',
    ).bind(like, like).all(),
    c.env.DB.prepare('SELECT * FROM resources WHERE title LIKE ? OR uploaded_by LIKE ? OR course LIKE ? OR cat LIKE ? ORDER BY created_at DESC LIMIT 20').bind(like, like, like, like).all(),
    c.env.DB.prepare("SELECT id, name, purpose, description, kind, member_count, created_by, created_at FROM groups WHERE kind = 'group' AND (name LIKE ? OR description LIKE ? OR purpose LIKE ?) LIMIT 20").bind(like, like, like).all(),
    c.env.DB.prepare(
      `SELECT j.*, COALESCE(p.full_name, '') AS posted_by_name FROM jobs j LEFT JOIN profiles p ON p.id = j.posted_by
        WHERE (j.role LIKE ? OR j.firm LIKE ? OR j.loc LIKE ?) AND (j.status = 'open' ${caller?.cohortUserId ? 'OR j.posted_by = ?' : ''} ${searchAdmin ? 'OR 1=1' : ''})
        ORDER BY j.created_at DESC LIMIT 20`,
    ).bind(...([like, like, like, ...(caller?.cohortUserId ? [caller.cohortUserId] : [])] as string[])).all(),
    caller
      ? c.env.DB.prepare(`SELECT ${PROFILE_COLS} FROM profiles WHERE full_name LIKE ? OR role LIKE ? LIMIT 20`).bind(like, like).all()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
  ]);
  return c.json({
    posts: posts.results,
    resources: resources.results,
    groups: groups.results,
    jobs: jobs.results,
    people: (people.results as Record<string, unknown>[]).map(rowToProfile),
  });
});

// likes_read (0001): using (true) - public. This convenience route scopes to
// the caller's own likes so the app can mark its liked posts.
app.get('/api/me/likes', async (c) => {
  const caller = await getCaller(c);
  if (!caller) return c.json({ error: 'unauthorized' }, 401);
  if (!caller.cohortUserId) return c.json({ postIds: [] });
  const { results } = await c.env.DB.prepare('SELECT post_id FROM post_likes WHERE user_id = ?').bind(caller.cohortUserId).all<{ post_id: string }>();
  return c.json({ postIds: results.map((r) => r.post_id) });
});

// jobs_read (0033 + anon variant): open to everyone; own any-status and
// admin-all for signed-in members. Invisible rows 404, same as RLS empty set.
app.get('/api/jobs/:id', async (c) => {
  const caller = await getCaller(c);
  let me: Profile | null = null;
  if (caller?.cohortUserId) me = await getProfile(c.env.DB, caller.cohortUserId);
  const j = await c.env.DB.prepare(
    `SELECT j.*, COALESCE(p.full_name, '') AS posted_by_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
       FROM jobs j LEFT JOIN profiles p ON p.id = j.posted_by
      WHERE j.id = ? AND (j.status = 'open' ${caller?.cohortUserId ? 'OR j.posted_by = ?' : ''} ${isAdmin(me) ? 'OR 1=1' : ''})`,
  ).bind(...([c.req.param('id'), ...(caller?.cohortUserId ? [caller.cohortUserId] : [])] as string[])).first();
  if (!j) return c.json({ error: 'not_found' }, 404);
  return c.json({ job: j });
});

// resources_read (0001): using (true) - public.
app.get('/api/resources/:id', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(c.req.param('id')).first();
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json({ resource: r });
});

export default app;
