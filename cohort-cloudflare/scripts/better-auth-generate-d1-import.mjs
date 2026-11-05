/**
 * Turn the export from export-supabase-users.mjs into D1 import SQL for the
 * auth worker's Better Auth schema. UUIDs are preserved so posts, profiles
 * and other rows keyed by user id stay attached.
 *
 * Usage:
 *   node scripts/generate-d1-import.mjs exports/supabase-users-<date>.json > exports/import.sql
 *   wrangler d1 execute <db> --file=exports/import.sql        # remote, after approval
 *   wrangler d1 execute DB --local --file=exports/import.sql  # local rehearsal
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/generate-d1-import.mjs <export.json>');
  process.exit(1);
}
const { users } = JSON.parse(readFileSync(file, 'utf8'));
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const ts = (d) => (d ? new Date(d).toISOString() : new Date().toISOString());

console.log('BEGIN TRANSACTION;');
for (const u of users) {
  const now = new Date().toISOString();
  console.log(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (` +
      `${q(u.id)}, ${q(u.name)}, ${q(u.email)}, ${u.email_confirmed_at ? 1 : 0}, ${q(ts(u.created_at))}, ${q(ts(u.updated_at))});`,
  );
  if (u.encrypted_password) {
    console.log(
      `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (` +
        `${q(crypto.randomUUID())}, ${q(u.id)}, 'credential', ${q(u.id)}, ${q(u.encrypted_password)}, ${q(now)}, ${q(now)});`,
    );
  }
}
console.log('COMMIT;');
console.error(`Generated statements for ${users.length} users.`);
