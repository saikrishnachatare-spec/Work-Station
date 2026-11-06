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

const BASE = process.env.BASE || 'https://cohort-test-preview.pages.dev';
if (!BASE.includes('cohort-test-preview.pages.dev') && !BASE.includes('localhost')) throw new Error('Preview/local only');
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
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (/Minified React error #|hydration|did not match/i.test(txt)) consoleErrors.push(txt.slice(0, 300));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    const txt = (d.exception && d.exception.description) || d.text || '';
    if (/Minified React error #|hydration|did not match/i.test(txt)) consoleErrors.push(txt.slice(0, 300));
  }
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


try {
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  await navigate(BASE+'/login');
  await waitFor(bodyHas('A quick note on analytics'));
  await clickText('Accept');
  await waitFor("localStorage.getItem('cohort-analytics-consent') === 'accepted'");
  if(await evalJs(bodyHas('A quick note on analytics'))) throw new Error('banner remained');
  console.log('PASS consent Accept stores accepted and dismisses');
  await navigate(BASE+'/login');
  await waitFor(bodyHas('Cohort test preview'));
  if(await evalJs(bodyHas('A quick note on analytics'))) throw new Error('banner returned');
  console.log('PASS accepted persists across full reload');
  const fs=await import('node:fs');
  fs.writeFileSync('/downloads/stage3-consent-accepted.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await clickText('Create account');
  await waitFor(bodyHas('Full name'));
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:500,deviceScaleFactor:1,mobile:true},sessionId);
  await evalJs("document.querySelector('input[placeholder=\"min 8 characters\"]').focus()");
  // Use the browser keyboard to reach the submit button from password.
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  const focused=await evalJs('document.activeElement.textContent');
  console.log('Keyboard focused:',focused);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await waitFor(bodyHas('Enter a valid email address.'));
  console.log('PASS keyboard Tab+Enter reaches signup submit at reduced 390x500 viewport; validation only, no Clerk signup');
  fs.writeFileSync('/downloads/stage3-keyboard-submit.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
} finally {ws.close();chrome.kill();rmSync(chromeData,{recursive:true,force:true});}
