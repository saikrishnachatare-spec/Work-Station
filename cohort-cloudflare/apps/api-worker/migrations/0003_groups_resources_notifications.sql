-- Slice 5: group invites, communities, resources, student_notes, notifications.
-- The groups/group_members stubs from 0002 become the full definitions (CHECKs
-- added in place there - prep-stage local migrations, never deployed).
-- Caps (0047): 1003 members/group, 23 groups/community - enforced worker-side
-- in the same batch as the insert (replaces the cap triggers).

-- group_invites (0008): token is the capability; resolving/joining goes
-- through dedicated endpoints like the PG definer functions.
CREATE TABLE IF NOT EXISTS group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- communities (0045)
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  about TEXT NOT NULL DEFAULT '' CHECK (length(about) <= 1000),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- community_groups (0045)
CREATE TABLE IF NOT EXISTS community_groups (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (community_id, group_id)
);

-- resources (0001 + file fields 0014 + subject 0019 + text caps 0044)
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  cat TEXT NOT NULL DEFAULT 'Notes',
  course TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(title) <= 300 AND length(meta) <= 500)
);

-- student_notes (0046)
CREATE TABLE IF NOT EXISTS student_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  subject TEXT NOT NULL DEFAULT '' CHECK (length(subject) <= 120),
  meta TEXT NOT NULL DEFAULT '' CHECK (length(meta) <= 100),
  uploader_name TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- notifications (0050; kind enum final state after 0053/0055/0059).
-- Inserts come from trigger-equivalent worker code ONLY (not ported yet -
-- documented behavior gap); clients can read and mark-read their own rows.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('message','comment','application_status','connection_request','connection_accepted','job_match','system')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id, created_at);
