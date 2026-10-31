# Security posture

Last audited: 2026-10-31.

## Application headers (vercel.dist.json, served on every response)
- Content-Security-Policy: default-src 'self'; scripts/styles 'self' + 'unsafe-inline'
  (the static export bootstraps inline; JSON-LD structured data is inline by design);
  connect-src limited to self, Supabase and Vercel; frame-ancestors 'none'.
- Strict-Transport-Security (2 years, includeSubDomains), X-Content-Type-Options: nosniff,
  X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin,
  Permissions-Policy: camera/microphone/geolocation off.

## Database (Supabase)
- Row-level security is ENABLED on all public tables; every table has policies.
  Verified by query against pg_class/pg_policies on 2026-10-31.
- Reads are public for community content (posts, groups, jobs, resources, profiles);
  messages and thread participants are visible to their participants only.
- Writes require a signed-in user acting as themselves, and (since migration 0007)
  an ACTIVE profile: suspended members can browse but every insert is rejected.
- Admin actions are enforced server-side via the security-definer is_admin() function;
  the admin panel UI only exposes what the database already permits.
- Only the publishable anon key ships in the app (safe by design - RLS protects data).
  No service-role or secret keys exist in the repo (scanned 2026-10-23).

## Authentication
- Email/password auth via Supabase. Public signup always creates role=user;
  admin is grant-only by an existing admin.
- Email confirmation is ON (enabled 2026-10-31). Transactional email (OTP,
  verification, emergency updates only) is sent via custom SMTP; the app does
  not send notification emails - member notifications are in-app (0050).
- Password minimum length: 8 (raised from the Supabase default, 2026-10-31).
- Rate limiting on auth endpoints is Supabase's built-in protection; application
  writes are additionally rate-limited in the database (0051: applications,
  group invites and resume uploads per day), and a server-side blocked-terms
  filter rejects spam/profanity in posts, comments and messages (0052).
- Direct messages and group adds require an accepted connection between the
  members (0053); admins and firm/enterprise accounts may message applicants
  directly. Invite-link joins stay open to everyone.
- Verification requests are reviewed by admins through a security-definer RPC
  that also stamps profiles.verified_at (0056); members cannot set it.

## Dependencies (pnpm audit, 2026-10-23)
- node-forge is pinned to >=1.4.1 via a pnpm override (2026-10-31), clearing
  its advisories. Remaining findings are build-time only with no upstream fix
  (zod 3.x via @expo/cli, glob, minimatch, deepmerge); none ship in the app
  bundle or the static site. Accepted risk, re-check on Expo SDK upgrades.

## Error reporting & analytics
- First-party error_logs table: anyone can report, only admins read/clear (RLS).
- Vercel Web Analytics is cookie-less and loads only after explicit consent.
