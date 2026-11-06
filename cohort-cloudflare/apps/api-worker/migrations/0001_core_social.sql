-- Cohort D1 schema - SLICE 1: core social loop (profiles, posts, likes, comments).
-- PREPARATION ONLY. Translated from cohort/supabase/migrations (68 files, 29
-- tables) by hand for the first endpoint slice; the full schema follows in
-- later slices. Column shapes follow the EFFECTIVE numbered-migration schema
-- (0001 + 0015 + 0023 + 0026 + 0029 + 0066), NOT the stale dated draft
-- 20261023000100_profiles.sql (an earlier parallel 0001 draft with a different
-- role enum and policy set - see docs/d1-schema-mapping.md).
-- Differences from Postgres are deliberate and documented in docs/d1-schema-mapping.md:
--   uuid            -> TEXT (worker generates crypto.randomUUID())
--   timestamptz     -> TEXT ISO-8601, default datetime('now')
--   RLS policies    -> NOT in D1; enforced in worker code (src/index.ts)
--   triggers        -> NOT in D1; count upkeep moves to worker code
--   auth.users ref  -> profiles.id is the Clerk external_id (Supabase UUID)

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','admin')),                     -- 0001_init.sql
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','deleted')),   -- 0001, widened by 0023
  course TEXT NOT NULL DEFAULT '' CHECK (course IN ('','CA','CMA','CS')),   -- 0015
  level TEXT NOT NULL DEFAULT '' CHECK (level IN ('','Foundation','Inter','Final')), -- 0015
  avatar_path TEXT,                                       -- 0015
  verified_at TEXT,                                       -- 0026
  account_type TEXT NOT NULL DEFAULT 'individual',        -- 0029
  org_name TEXT NOT NULL DEFAULT '',                      -- 0029
  city TEXT NOT NULL DEFAULT '',                          -- 0066
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
