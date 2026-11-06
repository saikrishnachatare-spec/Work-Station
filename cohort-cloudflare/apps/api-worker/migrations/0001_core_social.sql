-- Cohort D1 schema - SLICE 1: core social loop (profiles, posts, likes, comments).
-- PREPARATION ONLY. Translated from cohort/supabase/migrations (68 files, 29
-- tables) by hand for the first endpoint slice; the full schema follows in
-- later slices. Differences from Postgres are deliberate and documented in
-- docs/d1-schema-mapping.md:
--   uuid            -> TEXT (worker generates crypto.randomUUID())
--   timestamptz     -> TEXT ISO-8601, default datetime('now')
--   RLS policies    -> NOT in D1; enforced in worker code (authz.ts)
--   triggers        -> NOT in D1; count upkeep moves to worker code
--   auth.users ref  -> profiles.id is the Clerk external_id (Supabase UUID)

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student','mentor','firm','moderator')),
  course TEXT NOT NULL DEFAULT '' CHECK (course IN ('','CA','CMA','CS')),
  level TEXT NOT NULL DEFAULT '' CHECK (level IN ('','Foundation','Inter','Final')),
  account_type TEXT NOT NULL DEFAULT 'individual',
  org_name TEXT NOT NULL DEFAULT '',
  city TEXT,
  avatar_path TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post','announcement','message')),
  body TEXT NOT NULL,
  image_path TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) <= 2000),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
