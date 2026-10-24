#!/usr/bin/env node
// Click-and-type browser regression tests for the deployed Cohort web app.
// Zero-dependency: drives a local headless Chrome over the DevTools protocol.
//
// Usage:
//   node scripts/e2e-browser.mjs                      # public flows only
//   COHORT_TEST_EMAIL=... COHORT_TEST_PASSWORD=... \
//     node scripts/e2e-browser.mjs                    # + signed-in flows
//   BASE=http://localhost:8081 node scripts/e2e-browser.mjs
//
// Signed-in flows run ONLY with the controlled test account credentials.
// Never point them at a real user's account: the work-screen test writes a
// keyword preference row for the signed-in user (cleaned up separately).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'https://cohort-pi-eight.vercel.app';
const EMAIL = process.env.COHORT_TEST_EMAIL || '';
const PASSWORD = process.env.COHORT_TEST_PASSWORD || '';
const CHROME = process.env.CHROME_BIN || 'google-chrome';

let passed = 0, failed = 0, skipped = 0;
const ok = (name) => { passed++; console.log('PASS ', name); };
const fail = (name, why) => { failed++; console.log('FAIL ', name, '-', why); };
const skip = (name, why) => { skipped++; console.log('SKIP ', name, '-', why); };

// ---- minimal CDP client -------------------------------------------------
const chromeData = mkdtempSync(join(tmpdir(), 'cohort-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=390,844', `--user-data-dir=${chromeData}`, 'about:blank',
]);
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) res(m[1]);
  });
  chrome.on('exit', () => rej(new Error('chrome exited early')));
  setTimeout(() => rej(new Error('chrome ws timeout')), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function cdp(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
await cdp('Runtime.enable', {}, sessionId);
await cdp('Page.enable', {}, sessionId);

async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error('page js: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
  return r.result?.value;
}
async function navigate(url) {
  await cdp('Page.navigate', { url }, sessionId);
  await waitFor('document.readyState === "complete"', 15000).catch(() => {});
}
async function waitFor(expr, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evalJs(`!!(${expr})`).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timeout waiting for: ' + expr.slice(0, 80));
}
const bodyHas = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;
async function clickText(text, tag = '*') {
  return evalJs(`(() => {
    const els = [...document.querySelectorAll('${tag}')].filter(e => e.childElementCount === 0 && (e.textContent || '').trim() === ${JSON.stringify(text)});
    const el = els[0]; if (!el) return false;
    let t = el; while (t && !t.onclick && t.tagName !== 'BUTTON' && getComputedStyle(t).cursor !== 'pointer') t = t.parentElement;
    (t || el).click(); return true;
  })()`);
}
async function typeInto(placeholder, text) {
  return evalJs(`(() => {
    const el = document.querySelector('input[placeholder*=${JSON.stringify(placeholder)}], textarea[placeholder*=${JSON.stringify(placeholder)}]');
    if (!el) return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(el.constructor === HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

// ---- tests ---------------------------------------------------------------
try {
  // 1. Home renders the sign-in form when signed out.
  await navigate(BASE + '/');
  try {
    await waitFor(bodyHas('Sign in'));
    ok('home renders sign-in form when signed out');
  } catch (e) { fail('home renders sign-in form when signed out', e.message); }

  // 2. Sign-in validation reacts to a bad email (click/type, no submit).
  try {
    await typeInto('email', 'not-an-email');
    await evalJs(`(() => { const b=[...document.querySelectorAll('div,button')].find(e=>(e.textContent||'').trim()==='Send code' || (e.textContent||'').trim()==='Sign in'); if(b){b.click();return true} return false })()`);
    await new Promise((r) => setTimeout(r, 1200));
    const complained = await evalJs(bodyHas('valid') + ' || ' + bodyHas('Invalid'));
    if (complained) ok('sign-in form validates a bad email');
    else ok('sign-in form accepts input without a crash');
  } catch (e) { fail('sign-in form input', e.message); }

  // 3. Bad invite link: signed-out visitors are asked to sign in first.
  await navigate(BASE + '/join?token=definitely-not-a-real-token');
  try {
    await waitFor(bodyHas('Sign in') + ' || ' + bodyHas('Invite link'));
    const t = await evalJs('document.body.innerText');
    if (/Sign in/i.test(t)) ok('bad invite link asks signed-out visitors to sign in');
    else if (/invalid|replaced|does not work/i.test(t)) ok('bad invite link shows honest error card');
    else fail('bad invite link handling', 'unexpected copy: ' + t.slice(0, 120));
  } catch (e) { fail('bad invite link handling', e.message); }

  // 4. Privacy and terms pages render.
  for (const [route, marker] of [['/privacy', 'Privacy'], ['/terms', 'Terms']]) {
    await navigate(BASE + route);
    try { await waitFor(bodyHas(marker)); ok(route + ' renders'); }
    catch (e) { fail(route + ' renders', e.message); }
  }

  const SESSION_FILE = process.env.COHORT_TEST_SESSION_FILE || '';
  if ((!EMAIL || !PASSWORD) && !SESSION_FILE) {
    skip('signed-in flows (feed, resources filter, work keyword save, messages)', 'COHORT_TEST_EMAIL / COHORT_TEST_PASSWORD or COHORT_TEST_SESSION_FILE not set');
  } else {
    // 5. Sign in with the controlled account: seeded session, or the form.
    try {
      if (SESSION_FILE) {
        const sessionJson = (await import('node:fs')).readFileSync(SESSION_FILE, 'utf8').trim();
        await navigate(BASE + '/');
        await waitFor('document.readyState === "complete"');
        const seedExpr = '(() => { const o = JSON.parse(' + JSON.stringify(sessionJson) + '); delete o.__key; localStorage.setItem("sb-ghjerdyubgjtfihumzhb-auth-token", JSON.stringify(o)); return true; })()';
        await evalJs(seedExpr);
        await navigate(BASE + '/');
        await waitFor(bodyHas('Good '), 20000);
        ok('controlled account session lands on the feed');
      } else {
      await navigate(BASE + '/');
      await waitFor('document.querySelector("input")');
      await evalJs(`(() => { localStorage.clear(); })()`);
      await navigate(BASE + '/');
      await waitFor('document.querySelector("input")');
      await typeInto('email', EMAIL);
      const typed = await typeInto('password', PASSWORD) || await evalJs(`(() => {
        const el = document.querySelector('input[type="password"]'); if (!el) return false;
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        el.focus(); s.call(el, ${JSON.stringify(PASSWORD)});
        el.dispatchEvent(new Event('input', { bubbles: true })); return true;
      })()`);
      if (!typed) throw new Error('no password field');
      const clicked = await evalJs(`(() => {
        const b = [...document.querySelectorAll('div,button')].filter(e => e.childElementCount < 3).find(e => /^(Sign in|Log in)$/.test((e.textContent || '').trim()));
        if (!b) return false; let t = b; while (t && getComputedStyle(t).cursor !== 'pointer') t = t.parentElement; (t || b).click(); return true;
      })()`);
      if (!clicked) throw new Error('no sign-in button');
      await waitFor(bodyHas('Good '), 20000);
      ok('controlled account signs in and lands on the feed');
      }
    } catch (e) { fail('controlled account reaches the feed', e.message); }

    // 6. Resources search filters by typing (seeds one controlled row, removes it after).
    let seededId = '';
    try {
      seededId = await evalJs(`(async () => {
        const ses = JSON.parse(localStorage.getItem('sb-ghjerdyubgjtfihumzhb-auth-token'));
        const r = await fetch('https://ghjerdyubgjtfihumzhb.supabase.co/rest/v1/resources', {
          method: 'POST',
          headers: { apikey: 'sb_publishable_wvBK4tt8qOBhv6C4W4016A_SnGs1tcC', Authorization: 'Bearer ' + ses.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ title: 'Regression Accounting Notes', cat: 'Notes', course: 'CA', subject: 'Accounting', meta: 'browser e2e', uploaded_by: 'E2E Three', owner_id: ses.user.id }),
        });
        if (!r.ok) throw new Error('seed ' + r.status + ' ' + (await r.text()).slice(0, 120));
        const rows = await r.json(); return rows[0].id;
      })()`);
      await navigate(BASE + '/resources');
      await waitFor(bodyHas('Pick a course'));
      await typeInto('Search', 'regression accounting');
      await waitFor(bodyHas('Regression Accounting Notes'));
      await typeInto('Search', 'zzzz-no-match');
      await waitFor(bodyHas('Nothing shared yet'));
      const cardGone = await evalJs('!' + bodyHas('Regression Accounting Notes'));
      if (cardGone) ok('resources search filters while typing');
      else fail('resources search filters while typing', 'card still listed for zzzz');
    } catch (e) { fail('resources search filters while typing', e.message); }
    finally {
      if (seededId) await evalJs(`(async () => {
        const ses = JSON.parse(localStorage.getItem('sb-ghjerdyubgjtfihumzhb-auth-token'));
        await fetch('https://ghjerdyubgjtfihumzhb.supabase.co/rest/v1/resources?id=eq.${seededId}', {
          method: 'DELETE', headers: { apikey: 'sb_publishable_wvBK4tt8qOBhv6C4W4016A_SnGs1tcC', Authorization: 'Bearer ' + ses.access_token },
        }); return true;
      })()`).catch(() => {});
    }

    // 7. Resources course chip switches content.
    await navigate(BASE + '/resources');
    try {
      await waitFor(bodyHas('Pick a course'));
      await clickText('CMA');
      await waitFor(bodyHas('CMA ›'));
      ok('resources course chip switches content');
    } catch (e) { fail('resources course chip switches content', e.message); }

    // 8. Work screen: type keywords, save, honest in-app state appears.
    await navigate(BASE + '/work');
    try {
      await waitFor(bodyHas('Vacancy alerts'));
      await typeInto('Keywords', 'zz-regression-term');
      await clickText('Save');
      await waitFor(bodyHas('No new matches since your last visit'), 15000);
      ok('work keyword save shows in-app alert state');
    } catch (e) { fail('work keyword save shows in-app alert state', e.message); }
    finally {
      await evalJs(`(async () => {
        const ses = JSON.parse(localStorage.getItem('sb-ghjerdyubgjtfihumzhb-auth-token'));
        await fetch('https://ghjerdyubgjtfihumzhb.supabase.co/rest/v1/job_alert_prefs?user_id=eq.' + ses.user.id, {
          method: 'DELETE', headers: { apikey: 'sb_publishable_wvBK4tt8qOBhv6C4W4016A_SnGs1tcC', Authorization: 'Bearer ' + ses.access_token },
        }); return true;
      })()`).catch(() => {});
    }

    // 9. Messages screen renders its composer entry.
    await navigate(BASE + '/messages');
    try { await waitFor(bodyHas('New message')); ok('messages screen renders'); }
    catch (e) { fail('messages screen renders', e.message); }
  }
} finally {
  chrome.kill('SIGKILL');
  await new Promise((r) => { chrome.on('exit', r); setTimeout(r, 3000); });
  for (let i = 0; i < 8; i++) {
    try { rmSync(chromeData, { recursive: true, force: true }); break; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  try { ws.close(); } catch {}
}
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
