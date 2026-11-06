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
    return { clerkUserId: claims.sub, cohortUserId: (claims.external_id as string) ?? null };
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
  if (!isClean(body.body)) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
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
    if (!isClean(first)) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
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
  if (!isClean(body.body)) return c.json({ error: 'rejected', reason: CLEAN_MSG }, 422);
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
    const n = await c.env.DB.prepare('SELECT id, owner_id FROM student_notes WHERE id = ?').bind(c.req.param('id')).first<{ id: string; owner_id: string }>();
    if (!n) return c.json({ error: 'not_found' }, 404);
    const me = await getProfile(c.env.DB, caller.cohortUserId);
    if (n.owner_id !== caller.cohortUserId && !isAdmin(me)) return c.json({ error: 'forbidden', reason: 'not_owner_or_admin' }, 403);
    if (method === 'delete') {
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

export default app;
