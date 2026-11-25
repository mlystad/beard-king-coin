#!/usr/bin/env node
/*
 * Design guardrails, browser half. Serves the built site (dist/ or the first
 * argument) and checks every page in Chromium at 1280px and 320px wide
 * (320px is what 400% zoom looks like, WCAG 1.4.10). Same file in both repos.
 *
 *   npm ci && node scripts/build.mjs && node scripts/check-a11y.mjs
 *   node scripts/check-a11y.mjs --update-baseline
 *
 * Browser: CHROMIUM_PATH=/path/to/chrome, otherwise installed Google Chrome
 * (GitHub's ubuntu runners have it), otherwise Playwright's own download.
 * Set FONTS=offline to skip loading Google Fonts (measures with fallback fonts).
 *
 * hard     reflow, focus-indicator, focus-obscured, keyboard-trap, keyboard-unreachable, reduced-motion-animation
 * ratchet  axe-<rule>, target-44, rendered-font-floor  (legacy counts live in
 *          design-baseline.json under "browser"; they may fall, never rise)
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const WIDTHS = [1280, 320];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const MIN_TARGET = 44;
const MIN_FONT = 14;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

export function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/signup') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"status":"stored"}'); return; }
    const p = join(dir, decodeURIComponent(url.pathname));
    const file = [p, p + '.html', join(p, 'index.html')].find((f) => existsSync(f) && statSync(f).isFile());
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(existsSync(join(dir, '404.html')) ? readFileSync(join(dir, '404.html')) : 'not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

/* ── runs inside the page ─────────────────────────────────────────────────── */

const inPage = {
  measure: ({ minTarget, minFont }) => {
    const visible = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const text = (e) => (e.textContent || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    const label = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + text(e) + '"');
    const sel = (e) => { const c = (x) => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + [...x.classList].slice(0, 2).map((k) => '.' + k).join(''); return (e.parentElement ? c(e.parentElement) + ' > ' : '') + c(e); };
    const small = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]')]
      .filter(visible)
      .filter((e) => !e.closest('.hp, .sr-only, [hidden], [inert]') && !e.classList.contains('skip-link'))
      // WCAG 2.5.8 exempts a link that sits inside a sentence, with other words around it. A link that is all
      // there is in its list item or table cell is a standalone target, however it is displayed.
      .filter((e) => { const host = e.closest('p, li, small, td, th, figcaption, dd'); return !(getComputedStyle(e).display === 'inline' && host && (host.textContent || '').replace(/\s+/g, ' ').trim() !== (e.textContent || '').replace(/\s+/g, ' ').trim()); })
      .map((e) => { const r = e.getBoundingClientRect(); return { el: label(e), key: sel(e) + ' ' + text(e), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((t) => t.w < minTarget || t.h < minTarget);
    const tiny = [...document.querySelectorAll('body *')]
      .filter((e) => !(e instanceof SVGElement) && !e.closest('svg, .sr-only, [hidden], .hp, script, style, noscript') && visible(e))
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => ({ el: label(e), key: sel(e), px: Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10 }))
      .filter((t) => t.px < minFont);
    return { scrollW: document.documentElement.scrollWidth, small, tiny };
  },
  // how many controls Tab should be able to reach on this page
  focusable: () => {
    const visible = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter((e) => !e.disabled && e.tabIndex >= 0 && e.type !== 'hidden' && visible(e) && !e.closest('[inert], [hidden]')).length;
  },
  focus: () => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    const indicator = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    // Sample a 3x3 grid inside the part of the element that is on screen; a point is covered when the
    // topmost thing there is neither the element nor part of it. Stacking order counts: a skip link
    // that sits on top of the header is fine.
    const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
    let total = 0, hit = 0;
    if (x1 > x0 && y1 > y0) {
      for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
        const top = document.elementFromPoint(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy); total++;
        if (top && (top === e || e.contains(top) || top.contains(e))) hit++;
      }
    }
    const covered = total ? 1 - hit / total : 1;   // off screen entirely counts as covered: Tab should scroll it into view
    const t = (e.textContent || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return { el: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + t + '"', indicator: Boolean(indicator), covered, key: e.tagName + '|' + e.id + '|' + t + '|' + Math.round(r.left) + '|' + Math.round(window.scrollY + r.top) };
  },
};

/* ── analysis ─────────────────────────────────────────────────────────────── */

export async function analyze(dir, { chromium, axeSource, launch, fonts = 'online', pages, fontRoute }) {
  const findings = [];
  const add = (id, level, where, detail, key) => findings.push({ id, level, where, detail, key: key ?? detail });
  const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.html')).sort();
  const list = pages || files.filter((f) => !/^maintenance\.html$/.test(f)).map((f) => '/' + f.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, ''));
  const { server, port } = await serve(dir);
  const browser = await chromium.launch(launch);
  try {
    for (const path of list) for (const width of WIDTHS) {
      const where = `${path || '/'} @${width}px`;
      const ctx = await browser.newContext({ viewport: { width, height: 700 } });
      const page = await ctx.newPage();
      await page.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 200, body: '' }));
      if (fonts === 'offline') await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
      if (fontRoute) await fontRoute(page);   // lets a caller supply the real fonts when the network cannot
      await page.goto(`http://127.0.0.1:${port}${path.startsWith('/') ? path : '/' + path}`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => document.fonts.ready.then(() => 0)).catch(() => {});
      await page.waitForFunction(() => document.getAnimations().every((a) => a.effect && a.effect.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 6000 }).catch(() => {});

      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async (tags) => (await axe.run(document, { runOnly: tags })).violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) })), AXE_TAGS);
      for (const v of violations) for (const n of v.nodes) add(`axe-${v.id}`, 'ratchet', where, `${v.help}: ${n.slice(0, 80)}`, n);

      const m = await page.evaluate(inPage.measure, { minTarget: MIN_TARGET, minFont: MIN_FONT });
      if (m.scrollW > width) add('reflow', 'hard', where, `page is ${m.scrollW}px wide in a ${width}px window: it needs sideways scrolling (WCAG 1.4.10)`);
      for (const t of m.small) add('target-44', 'ratchet', where, `${t.el} is ${t.w}x${t.h}px, minimum ${MIN_TARGET}px (WCAG 2.5.5 goal; 2.5.8 floor is 24px)`, t.key);
      for (const t of m.tiny) add('rendered-font-floor', 'ratchet', where, `${t.el} renders at ${t.px}px, minimum ${MIN_FONT}px`, t.key);

      if (width === WIDTHS[0]) {
        // keyboard: every stop shows an indicator and is not hidden behind a fixed element.
        // The order must end properly: focus leaves the document, or comes back round to the first stop,
        // and by then every focusable control must have been visited. A control that holds focus,
        // a repeated stop, or a loop through only some controls is a trap (WCAG 2.1.2).
        const expected = await page.evaluate(inPage.focusable);
        const seen = new Set(); let prev = null, first = null, ended = false, trapped = false;
        for (let i = 0; i < expected + 40; i++) {
          await page.keyboard.press('Tab');
          // smooth scrolling can start late: wait until the page has been still for four samples in a row
          let lastY = -1, still = 0; for (let k = 0; k < 80 && still < 4; k++) { await page.waitForTimeout(50); const y = await page.evaluate(() => scrollY); still = y === lastY ? still + 1 : 0; lastY = y; }
          const f = await page.evaluate(inPage.focus);
          if (!f) { ended = true; break; }                          // focus left the page: end of the order
          if (f.key === prev) { trapped = true; add('keyboard-trap', 'hard', where, `focus stayed on ${f.el} after Tab (WCAG 2.1.2)`); break; }
          if (first && f.key === first && seen.size >= 2) { ended = true; break; }   // wrapped round to the first stop
          if (seen.has(f.key)) { trapped = true; add('keyboard-trap', 'hard', where, `focus came back to ${f.el} before the end of the page (WCAG 2.1.2)`); break; }
          if (!first) first = f.key;
          prev = f.key; seen.add(f.key);
          if (!f.indicator) add('focus-indicator', 'hard', where, `${f.el} shows no focus indicator (WCAG 2.4.7)`);
          if (f.covered > 0.5) add('focus-obscured', 'hard', where, `${f.el} is ${Math.round(f.covered * 100)}% hidden behind a fixed element when focused (WCAG 2.4.11)`);
        }
        if (!ended && !trapped) add('keyboard-trap', 'hard', where, `tabbing ${expected + 40} times never reached the end of the page (WCAG 2.1.2)`);
        if (ended && seen.size < expected) add('keyboard-unreachable', 'hard', where, `Tab reached only ${seen.size} of ${expected} focusable controls (WCAG 2.1.1)`);
      }
      await ctx.close();
    }
    // reduced motion: nothing keeps running once the page has settled
    for (const path of list) {                // every page: animations live on particular pages, not on the first one found
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 200, body: '' }));
      if (fonts === 'offline') await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
      await page.goto(`http://127.0.0.1:${port}${path.startsWith('/') ? path : '/' + path}`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.transitionProperty || 'animation'));
      if (running.length) add('reduced-motion-animation', 'hard', `${path || '/'} reduced motion`, `still animating: ${[...new Set(running)].join(', ')} (WCAG 2.3.3)`);
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  return findings;
}

export function evaluate(findings, baseline = {}) {
  const hard = findings.filter((f) => f.level === 'hard');
  // Unique offenders only: the same footer link failing on ten pages is one problem, and adding
  // a page that reuses it must not trip the ratchet.
  const seen = new Set(), unique = [];
  for (const f of findings.filter((x) => x.level === 'ratchet')) { const k = f.id + '|' + f.key; if (!seen.has(k)) { seen.add(k); unique.push(f); } }
  const counts = {};
  unique.forEach((f) => { counts[f.id] = (counts[f.id] || 0) + 1; });
  const base = baseline.browser || {};
  const over = Object.keys(counts).filter((id) => counts[id] > (base[id] || 0));
  const under = Object.keys({ ...base, ...counts }).filter((id) => (counts[id] || 0) < (base[id] || 0));
  return { hard, unique, counts, over, under, ok: hard.length === 0 && over.length === 0 };
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'dist'));
  if (!existsSync(dir)) { console.error(`check-a11y: ${dir} not found. Run the build first.`); process.exit(2); }
  let chromium, axeSource;
  try { ({ chromium } = require('playwright-core')); axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); }
  catch { console.error('check-a11y: playwright-core and axe-core are not installed. Run: npm ci'); process.exit(2); }
  const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : (process.env.CI ? { channel: 'chrome' } : {});
  const basePath = join(root, 'design-baseline.json');
  const baseline = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {};

  const findings = await analyze(dir, { chromium, axeSource, launch, fonts: process.env.FONTS === 'offline' ? 'offline' : 'online' });
  const res = evaluate(findings, baseline);

  if (args.includes('--update-baseline')) {
    baseline.browser = Object.fromEntries(Object.entries(res.counts).sort());
    writeFileSync(basePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log('check-a11y: baseline written', JSON.stringify(baseline.browser));
    return;
  }
  const byId = (l) => l.reduce((m, f) => ((m[f.id] = m[f.id] || []).push(f), m), {});
  for (const [id, l] of Object.entries(byId(res.hard))) { console.error(`\n✗ ${id} (${l.length})`); l.slice(0, 8).forEach((f) => console.error(`    ${f.where}: ${f.detail}`)); if (l.length > 8) console.error(`    … and ${l.length - 8} more`); }
  for (const id of res.over) { const l = res.unique.filter((f) => f.id === id); console.error(`\n✗ ${id}: ${l.length} found, baseline allows ${(baseline.browser || {})[id] || 0}`); l.slice(-8).forEach((f) => console.error(`    ${f.where}: ${f.detail}`)); }
  for (const id of res.under) console.log(`ℹ ${id}: ${res.counts[id] || 0} now, baseline ${(baseline.browser || {})[id]}. Lower it: node scripts/check-a11y.mjs --update-baseline`);
  const summary = Object.entries(res.counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  if (!res.ok) { console.error(`\ncheck-a11y: FAILED (${res.hard.length} hard, ratchet over: ${res.over.join(', ') || 'none'})`); process.exit(1); }
  console.log(`check-a11y: ok (legacy held by baseline: ${summary})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(2); });
