-- Stage 3 (signup/onboarding) - preview-only bootstrap fixtures.
-- profile_contacts mirrors upstream 0040/0041: phone collected at signup for
-- contact data only; owner/admin visibility is enforced at the worker layer
-- (no public route returns it).
CREATE TABLE IF NOT EXISTS profile_contacts (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL DEFAULT ''
);

-- Preview-only signup gate. The owner manages this table out-of-band
-- (wrangler d1 execute); no API route writes to it. A signed-in Clerk dev
-- user whose sub is listed here may complete the preview signup bootstrap.
CREATE TABLE IF NOT EXISTS preview_bootstrap_allowlist (
  sub TEXT PRIMARY KEY
);

-- Subs that completed the preview bootstrap. Written ONLY by
-- POST /api/me/bootstrap; read by getCaller as an additional accepted
-- binding path inside the same production-inert triple gate
-- (PREVIEW_IDENTITY_BINDING + issuer pin + dev host).
CREATE TABLE IF NOT EXISTS preview_bound_subs (
  sub TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
