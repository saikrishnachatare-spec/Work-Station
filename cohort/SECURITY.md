# Security posture

Last audited: 2026-10-23.

## Application headers (vercel.dist.json, served on every response)
- Content-Security-Policy: default-src 'self'; scripts/styles 'self' + 'unsafe-inline'
  (the static export bootstraps inline; JSON-LD structured data is inline by design);
  connect-src limited to self, Supabase and Vercel; frame-ancestors 'none'.
- Strict-Transport-Security (2 years, includeSubDomains), X-Content-Type-Options: nosniff,
  X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin,
  Permissions-Policy: camera/microphone/geolocation off.

## Database (Supabase)
- Row-level security is ENABLED on all 12 public tables; every table has policies.
  Verified by query against pg_class/pg_policies on 2026-10-23.
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
- Email confirmation is temporarily OFF (free-tier send quota); re-enable it once
  custom SMTP (Brevo free tier) is connected. Tracked as a launch blocker.
- Password minimum length: Supabase default (6). Raising to 8 is pending - the
  dashboard Auth settings page was erroring at audit time and the management
  token lacks the auth_config scope. Low risk, revisit.
- Rate limiting on auth endpoints is Supabase's built-in free-tier protection.

## Dependencies (pnpm audit, 2026-10-23)
- 2 known high findings, both build-time only, no upstream patch available:
  braces (via metro) and node-forge (via @expo/cli). Neither ships in the app
  bundle or the static site; accepted risk, re-check on Expo SDK upgrades.

## Error reporting & analytics
- First-party error_logs table: anyone can report, only admins read/clear (RLS).
- Vercel Web Analytics is cookie-less and loads only after explicit consent.
