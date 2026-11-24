/*
 * The pledge form's error state, driven in a browser against the built coin page.
 * A screen reader needs the field itself marked invalid and tied to its message
 * (WCAG 3.3.1, 4.1.2). Needs Chromium (CHROMIUM_PATH, or Chrome when CI is set); skips
 * without it. Coin repository only.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { serve } from './check-a11y.mjs';
import { buildIsolated } from './build-fixture.mjs';

const require = createRequire(import.meta.url);
const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : (process.env.CI ? { channel: 'chrome' } : null);
let chromium = null; try { ({ chromium } = require('playwright-core')); } catch {}
const skip = launch && chromium ? false : 'no Chromium (set CHROMIUM_PATH)';
const built = skip ? null : buildIsolated({ SIGNUP_MODE: 'api' });
after(() => built && built.cleanup());

async function withPage(fn) {
  const { server, port } = await serve(built.dir);
  const browser = await chromium.launch(launch);
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com|googletagmanager/, (r) => r.fulfill({ status: 200, body: '' }));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.getElementById('consent')?.remove());
    await fn(page);
  } finally { await browser.close(); server.close(); }
}
const state = (page) => page.evaluate(() => { const i = document.getElementById('email'); return { invalid: i.getAttribute('aria-invalid'), by: i.getAttribute('aria-describedby'), msg: document.getElementById('cta-message').textContent.trim() }; });

test('pledge: the field is tied to its message from the start', { skip, timeout: 60000 }, async () => {
  await withPage(async (page) => {
    const s = await state(page);
    assert.ok((s.by || '').split(/\s+/).includes('cta-message'), `aria-describedby is "${s.by}"`);
    assert.equal(s.invalid, null);
  });
});
test('pledge: an invalid address marks the field invalid and keeps focus there', { skip, timeout: 60000 }, async () => {
  await withPage(async (page) => {
    await page.fill('#email', 'not-an-email');
    await page.click('#email-form button[type=submit]');
    const s = await state(page);
    assert.equal(s.invalid, 'true');
    assert.match(s.msg, /valid email/i);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'email');
  });
});
test('pledge: typing a better address clears the invalid mark', { skip, timeout: 60000 }, async () => {
  await withPage(async (page) => {
    await page.fill('#email', 'nope'); await page.click('#email-form button[type=submit]');
    assert.equal((await state(page)).invalid, 'true');
    await page.fill('#email', 'king@example.com');
    assert.equal((await state(page)).invalid, null);
  });
});
test('pledge: a successful pledge leaves the field valid', { skip, timeout: 60000 }, async () => {
  await withPage(async (page) => {
    await page.fill('#email', 'nope'); await page.click('#email-form button[type=submit]');
    await page.fill('#email', 'king@example.com'); await page.click('#email-form button[type=submit]');
    await page.waitForFunction(() => /pledge|inbox|recorded/i.test(document.getElementById('cta-message').textContent));
    assert.equal((await state(page)).invalid, null);
  });
});
