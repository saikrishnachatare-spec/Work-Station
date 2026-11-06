-- Slice 3: messaging (threads / thread_participants / messages), connections,
-- user_blocks, plus MINIMAL groups/group_members stubs so foreign keys resolve.
-- The stubs carry only the columns the messaging authorization helpers need;
-- the full groups/communities schema is slice 5 and will extend them.
-- Translation decisions match 0001 (uuid->TEXT PK, timestamptz->TEXT ISO,
-- RLS->worker-side authz). Source: effective Supabase state, 68 migrations.

-- STUB (slice 5 expands): groups - 0001 base + kind (0045)
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('group','channel')), -- 0045
  member_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- STUB (slice 5 expands): group_members - 0001 base + role (0036)
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')), -- 0036
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);

-- threads: 0001 base + group_id (0008). group_id NULL = 1:1 DM thread;
-- non-NULL = the chat thread of that group (channel kinds via groups.kind).
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- thread_participants: 0001 base + last_read_at (0020 read state / unread counts)
CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);

-- messages: 0001 base + body length cap 1..4000 (0044 messages_body_len)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_thread_created ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_created ON messages(sender_id, created_at);

-- connections: 0053 base, pair uniqueness as changed by 0060:
-- only live states (pending/accepted) hold the pair; declined rows are history.
-- PG least()/greatest() -> SQLite min()/max() scalar functions.
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_unique ON connections
  (min(requester_id, addressee_id), max(requester_id, addressee_id))
  WHERE status IN ('pending','accepted');

-- user_blocks: 0016. blocker_id default auth.uid() in PG; the worker sets it.
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
