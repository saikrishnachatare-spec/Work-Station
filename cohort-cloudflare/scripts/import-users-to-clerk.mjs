/**
 * Import the Supabase Auth export into Clerk - STAGE 1, runs only after
 * approval (needs a real Clerk app + CLERK_SECRET_KEY, and the real export).
 *
 * Clerk's CreateUser accepts existing password digests: with
 * `password_hasher: 'bcrypt'` users keep their current passwords - the
 * bcrypt verification then happens on Clerk's infrastructure, not our
 * Worker. Each user's Supabase UUID is stored as Clerk `external_id`, and
 * we add it to session-token claims (Dashboard -> Sessions -> Customize
 * session token: { "external_id": "{{user.external_id}}" }) so the API
 * worker can map tokens back to existing posts/profiles rows.
 *
 * Source: https://clerk.com/docs/reference/backend/user/create-user and
 * https://clerk.com/docs/guides/development/migrating/overview (checked 2026-11-05).
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_test_... node scripts/import-users-to-clerk.mjs exports/supabase-users-<date>.json [--commit]
 * Default is a dry run: validates and prints the plan, creates nothing.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const commit = process.argv.includes('--commit');
if (!file) {
  console.error('Usage: node scripts/import-users-to-clerk.mjs <export.json> [--commit]');
  process.exit(1);
}
const key = process.env.CLERK_SECRET_KEY;
if (commit && !key) {
  console.error('--commit needs CLERK_SECRET_KEY (use a TEST instance key first).');
  process.exit(1);
}
const { users } = JSON.parse(readFileSync(file, 'utf8'));
const noHash = users.filter((u) => !u.encrypted_password);
if (noHash.length) {
  console.error(`${noHash.length} users have no password hash (e.g. OAuth-only) - they get a password-reset flow instead.`);
}

let created = 0, failed = 0;
for (const u of users) {
  const body = {
    external_id: u.id, // Supabase UUID - keeps posts/profiles attached
    email_address: [u.email],
    first_name: u.name,
    ...(u.encrypted_password
      ? { password_digest: u.encrypted_password, password_hasher: 'bcrypt' }
      : { skip_password_requirement: true }),
  };
  if (!commit) continue;
  const res = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) created++;
  else {
    failed++;
    console.error(`FAIL ${u.email}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 120)); // stay gentle on rate limits
}
console.log(commit ? `Created ${created}, failed ${failed} of ${users.length}` : `DRY RUN: would import ${users.length} users (${noHash.length} without passwords). Rerun with --commit to execute.`);
