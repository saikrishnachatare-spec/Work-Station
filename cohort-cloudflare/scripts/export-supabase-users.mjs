/**
 * Export Supabase Auth users for the Better Auth migration. STAGE 1 - runs
 * only after approval, against a backup-verified database.
 *
 * Usage:
 *   npm i pg
 *   SUPABASE_DB_URL="postgresql://postgres:[password]@db.<ref>.supabase.co:5432/postgres" \
 *     node scripts/export-supabase-users.mjs
 *
 * Output: exports/supabase-users-<date>.json (gitignored - contains bcrypt
 * password hashes; handle like a secret, delete after migration).
 * Nothing is sent anywhere except read from the database you point it at.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL (use the read-only session if available).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: 'require' });
await client.connect();

const { rows } = await client.query(`
  SELECT id, email,
         encrypted_password,
         email_confirmed_at,
         coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)) AS name,
         created_at, updated_at, last_sign_in_at
  FROM auth.users
  ORDER BY created_at
`);

const badHash = rows.filter((r) => !/^\$2[aby]\$\d\d\$/.test(r.encrypted_password ?? ''));
const report = {
  exportedAt: new Date().toISOString(),
  count: rows.length,
  nonBcryptHashes: badHash.map((r) => r.id),
  users: rows,
};

mkdirSync(new URL('../exports', import.meta.url).pathname, { recursive: true });
const file = `exports/supabase-users-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(`Exported ${rows.length} users to ${file}`);
if (badHash.length) {
  console.log(`WARNING: ${badHash.length} users have non-bcrypt hashes - these accounts cannot keep their password and need a reset flow.`);
} else {
  console.log('All password hashes are bcrypt ($2a/$2b/$2y) - compatible with the verified import path.');
}
await client.end();
