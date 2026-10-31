#!/usr/bin/env node
/**
 * HTTP smoke test: verifies every app route serves the shell and the JS bundle
 * loads, and that the backend answers. Zero browser dependencies. This is NOT
 * a browser E2E test - it does not click, type, or verify rendered behavior.
 * Pass a deployment URL to gate that deployment; the CI workflow runs it
 * against the current live alias as a regression check.
 *
 * Usage: node scripts/e2e-smoke.mjs [baseUrl]
 */
const base = process.argv[2] || 'https://cohort-pi-eight.vercel.app';
const routes = [
  '/', '/resources', '/community', '/work', '/messages',
  '/account', '/login', '/privacy', '/terms', '/search', '/create',
  '/admin', '/safety?type=user&id=test', '/join?token=bogus',
  '/post?id=bogus', '/job?id=bogus', '/group-chat?group=bogus',
];
let failures = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!pass) failures += 1;
};

for (const route of routes) {
  try {
    const res = await fetch(base + route, { redirect: 'follow' });
    const html = await res.text();
    const shell = res.status === 200 && html.includes('id="root"');
    ok(`route ${route}`, shell, `HTTP ${res.status}`);
  } catch (err) {
    ok(`route ${route}`, false, String(err));
  }
}

// Unknown routes must land on the branded 404 page.
try {
  const res = await fetch(base + '/no-such-page');
  const html = await res.text();
  ok('route /no-such-page (branded 404)', res.status === 404 && html.includes('Cohort'), `HTTP ${res.status}`);
} catch (err) {
  ok('route /no-such-page (branded 404)', false, String(err));
}

// Bundle must actually download.
try {
  const html = await (await fetch(base + '/')).text();
  const srcs = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  let biggest = 0;
  for (const src of srcs) {
    const js = await fetch(new URL(src, base));
    const body = await js.text();
    if (js.status === 200) biggest = Math.max(biggest, body.length);
  }
  ok('js bundle downloads', biggest > 100000, `${Math.round(biggest / 1024)} KB`);
} catch (err) {
  ok('js bundle downloads', false, String(err));
}

// Backend must answer (anon health of the REST API).
try {
  const res = await fetch('https://ghjerdyubgjtfihumzhb.supabase.co/rest/v1/profiles?select=id&limit=1', {
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_wvBK4tt8qOBhv6C4W4016A_SnGs1tcC' },
  });
  ok('backend REST answers', res.status === 200 || res.status === 401 || res.status === 403, `HTTP ${res.status}`);
} catch (err) {
  ok('backend REST answers', false, String(err));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
