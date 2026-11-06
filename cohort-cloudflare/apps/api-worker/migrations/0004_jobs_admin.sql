-- 0004_jobs_admin.sql - slice 4: jobs, applications, verification requests,
-- content reports, job alert prefs, blocked terms, error logs, activity log,
-- trash, privilege audit. Shapes mirror the effective Supabase migration
-- state (sources noted per table). TEXT timestamps via datetime('now');
-- json as TEXT. See docs/d1-schema-mapping.md for policy parity notes.

-- blocked_terms (0052) - replaces the seeded in-code list from slices 2/3
CREATE TABLE IF NOT EXISTS blocked_terms (
  term TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO blocked_terms (term) VALUES
  ('chutiya'), ('madarchod'), ('bhenchod'), ('randi'), ('harami'),
  ('nigger'), ('faggot'), ('whore'), ('slut'),
  ('leaked paper'), ('leak paper'), ('exam leak'), ('answer key leak');

-- jobs (0001 + 0010 description/deadline + 0033 status + 0044 text len + 0065 openings)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  cat TEXT NOT NULL DEFAULT 'Jobs',
  firm TEXT NOT NULL,
  role TEXT NOT NULL,
  loc TEXT NOT NULL DEFAULT '',
  pay TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  posted_by TEXT REFERENCES profiles(id),
  description TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  openings INTEGER CHECK (openings IS NULL OR openings > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(description) <= 5000 AND length(role) <= 200 AND length(firm) <= 200)
);
CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS jobs_posted_by ON jobs(posted_by);

-- applications (0002 + 0030 status + 0049 resume metadata; resume BYTES not ported)
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','shortlisted','rejected')),
  resume_path TEXT,
  resume_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, user_id)
);
CREATE INDEX IF NOT EXISTS applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS applications_job ON applications(job_id);

-- verification_requests (0056)
CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_one_open
  ON verification_requests(user_id) WHERE status = 'pending';

-- content_reports (0016)
CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','user','job')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS content_reports_status ON content_reports(status, created_at);

-- job_alert_prefs (0021)
CREATE TABLE IF NOT EXISTS job_alert_prefs (
  user_id TEXT PRIMARY KEY,
  keywords TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- error_logs (0006 + 0044 sanitize/rate; client-insertable, admin read/delete)
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS error_logs_created ON error_logs(created_at);

-- activity_log (0032) - written by server-side paths only, admin read
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS activity_log_created ON activity_log(created_at);

-- trash (0032 + 0035) - admin read; rows created by admin trash actions
CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  trashed_by TEXT,
  trashed_by_name TEXT NOT NULL DEFAULT '',
  trashed_at TEXT NOT NULL DEFAULT (datetime('now')),
  restored_at TEXT
);

-- privilege_audit (0018) - written when an admin changes role/status, admin read
CREATE TABLE IF NOT EXISTS privilege_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  target_id TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT,
  old_status TEXT,
  new_status TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
