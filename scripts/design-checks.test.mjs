/*
 * Proof that the guardrails bite: each case builds a tiny site containing one
 * violation and asserts the right rule fires. Run with: npm run test:design
 * Same file in both repositories. The browser cases need Chromium
 * (CHROMIUM_PATH, or Google Chrome when CI is set) and skip without it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { analyze, evaluate, contrast, hexToRgb, fontPx, parseCSS } from './check-design.mjs';
import { analyze as analyzeBrowser, evaluate as evaluateBrowser } from './check-a11y.mjs';

const RULES = {
  minFontPx: 14, maxLetterSpacingEm: 0.12,
  contrast: [{ fg: '--fg', bg: '--bg', min: 4.5, use: 'body' }],
  allowedHosts: ['example.com', 'www.w3.org'],
  bannedClaims: ['free shipping', 'in stock'],
  allowedClaims: [],
};
const BASE_CSS = ':root{--fg:#ffffff;--bg:#000000} body{background:var(--bg);color:var(--fg);font-size:1rem}';
const page = (body = '<main><h1>Title</h1><p>Text</p></main>', head = '') =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>${head}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;

function site(files) {
  const dir = mkdtempSync(join(tmpdir(), 'design-'));
  for (const [name, content] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), content); }
  return dir;
}
function run(files, rules = RULES) {
  const dir = site(typeof files === 'string' ? { 'index.html': files } : files);
  try { return analyze(dir, rules); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const ids = (f) => [...new Set(f.map((x) => x.id))].sort();
const withCss = (css, body) => page(body).replace('</style>', css + '</style>');

test('helpers: contrast, hex, font size', () => {
  assert.equal(contrast(hexToRgb('#000'), hexToRgb('#fff')).toFixed(1), '21.0');
  assert.ok(contrast(hexToRgb('#777777'), hexToRgb('#ffffff')) < 4.5);
  assert.equal(fontPx('0.75rem'), 12); assert.equal(fontPx('14px'), 14); assert.equal(fontPx('clamp(2.6rem, 15vw, 4rem)'), 41.6);
  assert.equal(fontPx('1.2em'), null); assert.equal(fontPx('inherit'), null);
  assert.equal(parseCSS('@media (max-width:1px){a{color:red}} b{color:blue}').length, 2);
});

test('a clean page produces no findings', () => assert.deepEqual(run(page()), []));

const cases = [
  ['font below the floor', withCss('.x{font-size:0.75rem}'), 'font-size-floor'],
  ['font floor ignores sizes it cannot resolve', withCss('.x{font-size:1.2em}'), null],
  ['wide tracking on small text', withCss('.x{font-size:0.875rem;letter-spacing:0.2em}'), 'letter-spacing-cap'],
  ['wide tracking on large text is fine', withCss('.x{font-size:1.25rem;letter-spacing:0.2em}'), null],
  ['focus outline removed with no replacement', withCss('a:focus{outline:none}'), 'focus-indicator-removed'],
  ['focus outline replaced by a border is fine', withCss('a:focus{outline:none;border-color:var(--fg)}'), null],
  ['hardcoded colour in a component', withCss('.x{color:#ff0000}'), 'color-literal'],
  ['black and white overlays are exempt', withCss('.x{box-shadow:0 0 4px rgba(0,0,0,.4)}'), null],
  ['token used instead of a literal', withCss('.x{color:var(--fg)}'), null],
  ['animation with no reduced-motion block', withCss('@keyframes k{from{opacity:0}to{opacity:1}} .x{animation:k 1s}'), 'reduced-motion-missing'],
  ['animation with a reduced-motion block is fine', withCss('@keyframes k{from{opacity:0}to{opacity:1}} .x{animation:k 1s} @media (prefers-reduced-motion: reduce){.x{animation:none}}'), null],
  ['smooth scroll not reset for reduced motion', withCss('html{scroll-behavior:smooth} @media (prefers-reduced-motion: reduce){.x{animation:none}}'), 'reduced-motion-scroll'],
  ['pinch zoom locked', page().replace('initial-scale=1', 'initial-scale=1, user-scalable=no'), 'zoom-locked'],
  ['no viewport meta', page().replace(/<meta name="viewport"[^>]*>/, ''), 'viewport-meta'],
  ['no lang', page().replace(' lang="en"', ''), 'html-lang'],
  ['two h1', page('<main><h1>a</h1><h1>b</h1></main>'), 'h1-count'],
  ['no h1', page('<main><h2>a</h2></main>'), 'h1-count'],
  ['heading level skipped', page('<main><h1>a</h1><h3>b</h3></main>'), 'heading-skip'],
  ['image without alt', page('<main><h1>a</h1><img src="x.png"></main>'), 'img-alt'],
  ['image with empty alt is fine', page('<main><h1>a</h1><img src="x.png" alt=""></main>'), null],
  ['target blank without noopener', page('<main><h1>a</h1><a href="/x" target="_blank">x</a></main>'), 'blank-no-noopener'],
  ['affiliate link without sponsored', page('<main><h1>a</h1><a href="https://www.amazon.com/dp/B0ABCDEFGH?tag=x-20" rel="noopener">x</a></main>', ''), 'affiliate-no-sponsored'],
  ['inline event handler', page('<main><h1>a</h1><button onclick="go()">x</button></main>'), 'inline-handler'],
  ['positive tabindex', page('<main><h1>a</h1><a href="/x" tabindex="3">x</a></main>'), 'tabindex-positive'],
  ['duplicate id', page('<main><h1 id="a">a</h1><p id="a">b</p></main>'), 'duplicate-id'],
  ['input without a label', page('<main><h1>a</h1><input type="email" id="e"></main>'), 'input-label'],
  ['input with a label is fine', page('<main><h1>a</h1><label for="e">Email</label><input type="email" id="e"></main>'), null],
  ['empty link', page('<main><h1>a</h1><a href="/x"></a></main>'), 'empty-control'],
  ['inline style attribute', page('<main><h1 style="color:red">a</h1></main>'), 'inline-style'],
  ['third-party script tag', page('<main><h1>a</h1></main>', '<script src="https://cdn.example.net/x.js"></script>'), 'external-script-tag'],
  ['link to a host that is not allowed', page('<main><h1>a</h1><a href="https://tracker.badhost.io/x">x</a></main>'), 'third-party-host'],
  ['link to an allowed host', page('<main><h1>a</h1><a href="https://example.com/x">x</a></main>'), null],
  ['banned claim in text', page('<main><h1>a</h1><p>Get free shipping today</p></main>'), 'banned-claim'],
  ['banned claim in the meta description', page('<main><h1>a</h1></main>', '<meta name="description" content="Everything in stock">'), 'banned-claim'],
  ['a claim inside another word is not a match', page('<main><h1>a</h1><p>Instocking the shelves</p></main>'), null],
];
for (const [name, html, expected] of cases) {
  test(`rule: ${name}`, () => {
    const got = ids(run(html));
    if (expected === null) assert.deepEqual(got, [], `unexpected: ${got}`);
    else assert.ok(got.includes(expected), `expected ${expected}, got [${got}]`);
  });
}

test('rule: hosts are checked inside JavaScript and CSS files too', () => {
  const f = run({ 'index.html': page(), 'app.js': "fetch('https://evil.badhost.io/p')", 'a.css': 'a{background:url(https://cdn.badhost.io/x.png)}' });
  assert.equal(f.filter((x) => x.id === 'third-party-host').length, 2);
});
test('rule: inline scripts may only name allowed hosts', () => {
  assert.ok(ids(run(page('<main><h1>a</h1></main><script>fetch("https://evil.badhost.io/x")</script>'))).includes('third-party-host'));
  assert.deepEqual(run(page('<main><h1>a</h1></main><script>fetch("https://example.com/x")</script>')), []);
});
test('rule: structured data may name schema.org', () => {
  assert.deepEqual(run(page('<main><h1>a</h1></main>', '<script type="application/ld+json">{"@context":"https://schema.org"}</script>')), []);
});
test('rule: stylesheets linked from a page are read', () => {
  const f = run({ 'index.html': page().replace('</head>', '<link rel="stylesheet" href="/s.css"></head>'), 's.css': '.x{font-size:10px}' });
  assert.ok(ids(f).includes('font-size-floor'));
});
test('rule: an allowed claim passes, with its reason on record', () => {
  const rules = { ...RULES, allowedClaims: [{ phrase: 'in stock', reason: 'Amazon listing B0TEST shows it' }] };
  assert.deepEqual(run(page('<main><h1>a</h1><p>Now in stock</p></main>'), rules), []);
});
test('rule: colour pairs below their ratio fail, missing tokens fail', () => {
  const low = { ...RULES, contrast: [{ fg: '--fg', bg: '--bg', min: 4.5, use: 'x' }] };
  const dir = site({ 'index.html': page().replace('--fg:#ffffff', '--fg:#555555') });
  assert.ok(ids(analyze(dir, low)).includes('token-contrast'));
  assert.ok(ids(analyze(dir, { ...RULES, contrast: [{ fg: '--nope', bg: '--bg', min: 3, use: 'x' }] })).includes('token-missing'));
  rmSync(dir, { recursive: true, force: true });
});
test('rule: a known contrast gap is held by the ratchet and must be removed once fixed', () => {
  const known = { ...RULES, contrast: [{ fg: '--fg', bg: '--bg', min: 4.5, use: 'x', known: 'todo' }] };
  const dir = site({ 'index.html': page().replace('--fg:#ffffff', '--fg:#555555') });
  const f = analyze(dir, known);
  assert.deepEqual(ids(f), ['token-contrast-known']); assert.equal(f[0].level, 'ratchet');
  assert.ok(ids(analyze(site({ 'index.html': page() }), known)).includes('token-contrast-known-fixed'));
  rmSync(dir, { recursive: true, force: true });
});

test('ratchet: more than the baseline fails, equal passes, fewer is noted', () => {
  const f = [{ id: 'font-size-floor', level: 'ratchet' }, { id: 'font-size-floor', level: 'ratchet' }];
  assert.equal(evaluate(f, { static: { 'font-size-floor': 1 } }).ok, false);
  assert.deepEqual(evaluate(f, { static: { 'font-size-floor': 1 } }).over, ['font-size-floor']);
  assert.equal(evaluate(f, { static: { 'font-size-floor': 2 } }).ok, true);
  const fewer = evaluate(f, { static: { 'font-size-floor': 5 } });
  assert.equal(fewer.ok, true); assert.deepEqual(fewer.under, ['font-size-floor']);
  assert.equal(evaluate([{ id: 'img-alt', level: 'hard' }], { static: {} }).ok, false, 'hard findings always fail');
});

/* ── browser cases ───────────────────────────────────────────────────────── */
const require = createRequire(import.meta.url);
const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : (process.env.CI ? { channel: 'chrome' } : null);
let chromium = null, axeSource = null;
try { ({ chromium } = require('playwright-core')); axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch {}
const canBrowse = Boolean(launch && chromium && axeSource);
const bpage = (css, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><style>body{margin:0;background:#000;color:#fff;font:16px/1.5 sans-serif} a,button{color:#fff} button{font:inherit;background:#000;border:1px solid #fff} ${css}</style></head><body><main><h1>Title</h1>${body}</main></body></html>`;
async function browse(html) {
  const dir = site({ 'index.html': html });
  try { return await analyzeBrowser(dir, { chromium, axeSource, launch, fonts: 'offline', pages: ['/'] }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const bcases = [
  ['a clean page', bpage('a:focus-visible,button:focus-visible{outline:2px solid #fff}', '<p><a href="#x" style="display:inline-block;padding:12px">Go</a></p><button style="padding:12px 20px">Do</button>'), null],
  ['content wider than a 320px screen', bpage('', '<p style="width:600px">wide</p>'), 'reflow'],
  ['a control with no focus indicator', bpage('a{outline:none} button{display:block}', '<p><a href="#x" style="display:inline-block;padding:12px">Go</a></p>'), 'focus-indicator'],
  ['a tiny tap target', bpage('a:focus-visible{outline:2px solid #fff}', '<p><a href="#x" style="display:inline-block;width:10px;height:10px;background:#fff"></a></p>'), 'target-24'],
  ['text under 14px', bpage('', '<p style="font-size:11px">small print</p>'), 'rendered-font-floor'],
  ['a focused control hidden behind a fixed bar', bpage('a:focus-visible{outline:2px solid #fff} .bar{position:fixed;left:0;right:0;top:0;bottom:0;background:#222;z-index:9}', '<p><a href="#x" style="display:inline-block;padding:12px">Go</a></p><div class="bar"></div>'), 'focus-obscured'],
  ['an animation that ignores reduced motion', bpage('a:focus-visible{outline:2px solid #fff} @keyframes s{to{transform:translateX(5px)}} .m{animation:s 1s infinite alternate}', '<p class="m">moving</p>'), 'reduced-motion-animation'],
  ['an axe violation (image without alt)', bpage('', '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'), 'axe-image-alt'],
];
for (const [name, html, expected] of bcases) {
  test(`browser: ${name}`, { skip: canBrowse ? false : 'no Chromium (set CHROMIUM_PATH)', timeout: 120000 }, async () => {
    const got = ids(await browse(html));
    if (expected === null) assert.deepEqual(got.filter((i) => !i.startsWith('axe-region') ), [], `unexpected: ${got}`);
    else assert.ok(got.includes(expected), `expected ${expected}, got [${got}]`);
  });
}
/* a site made of several pages, so page discovery and ordering are exercised */
async function browseSite(files) {
  const dir = site(files);
  try { return await analyzeBrowser(dir, { chromium, axeSource, launch, fonts: 'offline' }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const FOCUS = 'a:focus-visible,button:focus-visible{outline:2px solid #fff} ';
const link = (id, t) => `<a id="${id}" href="#${id}" style="display:inline-block;padding:12px">${t}</a>`;
const traps = [
  ['a control that keeps focus on itself', bpage(FOCUS, `${link('one', 'One')}${link('two', 'Two')}${link('three', 'Three')}<script>document.getElementById('two').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();e.target.focus();}})</script>`), 'keyboard-trap'],
  ['focus that cycles through only some of the controls', bpage(FOCUS, `${link('one', 'One')}${link('two', 'Two')}${link('three', 'Three')}<script>document.getElementById('two').addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();document.getElementById('one').focus();}})</script>`), null],
];
for (const [name, html, expected] of traps) {
  test(`browser: ${name} is reported`, { skip: canBrowse ? false : 'no Chromium (set CHROMIUM_PATH)', timeout: 120000 }, async () => {
    const got = ids(await browse(html));
    assert.ok(got.includes('keyboard-trap') || got.includes('keyboard-unreachable'), `expected a keyboard failure, got [${got}]`);
  });
}
test('browser: a normal tab order that ends at the end of the page passes', { skip: canBrowse ? false : 'no Chromium (set CHROMIUM_PATH)', timeout: 120000 }, async () => {
  const got = ids(await browse(bpage(FOCUS, `${link('one', 'One')}${link('two', 'Two')}${link('three', 'Three')}`)));
  assert.deepEqual(got.filter((i) => i.startsWith('keyboard')), []);
});
test('browser: reduced motion is checked on every page, not just the first one found', { skip: canBrowse ? false : 'no Chromium (set CHROMIUM_PATH)', timeout: 120000 }, async () => {
  const quiet = bpage(FOCUS, '<p>nothing moves here</p>');
  const moving = bpage(FOCUS + '@keyframes s{to{transform:translateX(5px)}} .m{animation:s 1s infinite alternate}', '<p class="m">moving</p>');
  // 404.html sorts before index.html: a check that only looks at the first page never sees the animation
  const got = ids(await browseSite({ '404.html': quiet, 'index.html': moving }));
  assert.ok(got.includes('reduced-motion-animation'), `expected reduced-motion-animation, got [${got}]`);
});
test('browser ratchet counts unique offenders, not repeats', () => {
  const f = ['/a', '/b', '/c'].map((w) => ({ id: 'target-24', level: 'ratchet', where: w, detail: 'x', key: 'footer link' }));
  assert.deepEqual(evaluateBrowser(f, { browser: { 'target-24': 1 } }).counts, { 'target-24': 1 });
  assert.equal(evaluateBrowser(f, { browser: { 'target-24': 1 } }).ok, true);
});
