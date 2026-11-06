-- Parity fix: upstream 0031_signup_course_level.sql widened the profiles.level
-- CHECK to ('','Foundation','Inter','Final','Executive','Professional','Member').
-- The prep D1 table still carried the older 0015 set, which would wrongly
-- reject Executive/Professional/Member at signup and on profile edits.
-- (CS 'CSEET' in app demo-data is NOT in the widened upstream set either -
-- a CS+CSEET signup fails upstream today; surfaced as a product question,
-- mirrored here, not "fixed" by us.)
-- SQLite cannot ALTER a CHECK: rebuild the table. defer_foreign_keys lets the
-- drop/recreate land in one migration without tripping referencing tables.
PRAGMA defer_foreign_keys = true;
CREATE TABLE profiles_new (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','deleted')),
  course TEXT NOT NULL DEFAULT '' CHECK (course IN ('','CA','CMA','CS')),
  level TEXT NOT NULL DEFAULT '' CHECK (level IN ('','Foundation','Inter','Final','Executive','Professional','Member')),
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
