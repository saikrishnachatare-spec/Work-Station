// Synthetic test-token minter for LOCAL slice tests only. Signs RS256 JWTs
// with a throwaway key generated per test run (never committed, never reused
// against the real Clerk instance). Usage:
//   node mint-token.mjs <privateKeyPemPath> <subject> <externalId|-> [expiresInSec]
// Prints the token on stdout.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [keyPath, sub, externalId, expiresIn = '300'] = process.argv.slice(2);
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'synthetic-test-key' }));
const claims = {
  sub,
  iss: 'https://synthetic.test',
  azp: 'https://synthetic.test',
  iat: now - 10,
  nbf: now - 10,
  exp: now + Number(expiresIn),
  sid: 'sess_synthetic',
  ...(externalId && externalId !== '-' ? { external_id: externalId } : {}),
};
const payload = b64u(JSON.stringify(claims));
const signer = createSign('RSA-SHA256');
signer.update(`${header}.${payload}`);
const sig = signer.sign(readFileSync(keyPath, 'utf8')).toString('base64url');
console.log(`${header}.${payload}.${sig}`);
