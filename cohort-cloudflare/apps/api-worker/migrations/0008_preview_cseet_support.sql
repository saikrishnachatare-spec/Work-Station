-- Approved preview-only deviation: support CS CSEET in the test stack.
-- This migration intentionally refuses a populated profiles table: dropping
-- this parent on D1 would cascade-delete child data even with deferred FKs.
-- Populated previews must use the validated replacement-DB snapshot workflow.
-- Fresh databases apply this before any seed/import rows. Do not remove guard.
CREATE TABLE _cseet_empty_guard (n INTEGER CHECK (n = 0));
INSERT INTO _cseet_empty_guard SELECT count(*) FROM profiles;
DROP TABLE _cseet_empty_guard;
PRAGMA defer_foreign_keys = true;
CREATE TABLE profiles_new (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','deleted')),
  course TEXT NOT NULL DEFAULT '' CHECK (course IN ('','CA','CMA','CS')),
  level TEXT NOT NULL DEFAULT '' CHECK (level IN ('','Foundation','Inter','Final','CSEET','Executive','Professional','Member')),
  avatar_path TEXT,
  verified_at TEXT,
  account_type TEXT NOT NULL DEFAULT 'individual',
  org_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  headline TEXT NOT NULL DEFAULT '' CHECK (length(headline) <= 120),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 2000),
  links TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links) AND json_type(links) = 'array'),
  skills TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skills) AND json_type(skills) = 'array'),
  experience TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(experience) AND json_type(experience) = 'array'),
  education TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(education) AND json_type(education) = 'array')
);
INSERT INTO profiles_new (id, full_name, role, status, course, level, avatar_path, verified_at, account_type, org_name, city, created_at, headline, bio, links, skills, experience, education)
  SELECT id, full_name, role, status, course, level, avatar_path, verified_at, account_type, org_name, city, created_at, headline, bio, links, skills, experience, education FROM profiles;
DROP TABLE profiles;
ALTER TABLE profiles_new RENAME TO profiles;
