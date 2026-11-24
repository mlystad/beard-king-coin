#!/usr/bin/env node
/*
 * Design guardrails, static half. Reads the built site (dist/ or the directory
 * given as the first argument) and checks it against design-rules.json.
 * No dependencies. The same file is used in itsthebeard and beard-king-coin;
 * only design-rules.json differs. Keep the two copies identical.
 *
 *   node scripts/check-design.mjs                  check ./dist
 *   node scripts/check-design.mjs --update-baseline  rewrite the ratchet counts
 *
 * Two kinds of rule:
 *   hard     any finding fails. These pass today and must keep passing.
 *   ratchet  known legacy problems are held at a count in design-baseline.json.
 *            More than the baseline fails; fewer prints a reminder to lower it.
 *            Each ratchet id maps to a todo in docs/DESIGN.md.
 *
 * See docs/DESIGN.md for what each rule protects and how to change one.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ── CSS parsing (small, enough for hand-written and generated CSS) ───────── */

export function parseCSS(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  (function walk(text, atStack) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      const semi = text.indexOf(';', i);
      if (semi !== -1 && semi < open && text.slice(i, semi).trim().startsWith('@')) { i = semi + 1; continue; }
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      i = j;
      if (/^@(media|supports|layer|container)/.test(prelude)) walk(body, [...atStack, prelude]);
      else if (/^@(-webkit-)?keyframes/.test(prelude)) rules.push({ kind: 'keyframes', prelude, atStack });
      else if (prelude.startsWith('@')) rules.push({ kind: 'at', prelude, decls: splitDecls(body), atStack });
      else rules.push({ kind: 'style', selector: prelude, decls: splitDecls(body), atStack });
    }
  })(css, []);
  return rules;
}

function splitDecls(body) {
  const out = []; let cur = '', depth = 0, quote = null;
  const flush = () => {
    const c = cur.trim(); cur = '';
    const k = c.indexOf(':');
    if (k > 0) out.push({ prop: c.slice(0, k).trim().toLowerCase(), value: c.slice(k + 1).trim().replace(/\s*!important$/i, ''), important: /!important\s*$/i.test(c) });
  };
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}

/* ── colour and size helpers ──────────────────────────────────────────────── */

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

/** px for a font-size we can resolve statically (px, rem, first arg of clamp/max/min); else null. */
export function fontPx(value) {
  const m = value.match(/^(?:clamp\(|max\(|min\()?\s*(-?[\d.]+)(px|rem)\b/);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1);
}
const emOf = (value) => { const m = value.match(/^(-?[\d.]+)em$/); return m ? parseFloat(m[1]) : null; };

const COLOR_PROPS = /^(color|background|background-color|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color)$/;
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i;
const NEUTRAL_OVERLAY = /rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,)]/i;

/* ── helpers to read the built site ───────────────────────────────────────── */

function walkFiles(dir) {
  return readdirSync(dir, { recursive: true }).map(String).filter((f) => statSync(join(dir, f)).isFile()).sort();
}
const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4]) : null; };
const hasAttr = (tag, name) => new RegExp(`\\s${name}(\\s|=|>|/)`, 'i').test(tag);

/* ── the analysis ─────────────────────────────────────────────────────────── */

/** Returns [{ id, level: 'hard'|'ratchet', where, detail }]. */
export function analyze(dir, rules) {
  const findings = [];
  const add = (id, level, where, detail) => findings.push({ id, level, where, detail });
  const files = walkFiles(dir);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));

  /* gather CSS: inline <style> blocks and local stylesheets */
  const cssSources = []; const seenCss = new Set();
  for (const f of htmlFiles) {
    const html = readFileSync(join(dir, f), 'utf8');
    [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].forEach((m, i) => { if (!seenCss.has(`${f}#${i}`)) { seenCss.add(`${f}#${i}`); cssSources.push({ where: `${f} <style>`, css: m[1] }); } });
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
      const href = attr(m[0], 'href'); if (!href || /^https?:|^\/\//.test(href)) continue;
      const p = href.startsWith('/') ? href.slice(1) : join(dirname(f), href);
      if (!seenCss.has(p) && existsSync(join(dir, p))) { seenCss.add(p); cssSources.push({ where: p, css: readFileSync(join(dir, p), 'utf8') }); }
    }
  }
  const allRules = cssSources.flatMap((s) => parseCSS(s.css).map((r) => ({ ...r, src: s.where })));
  const styleRules = allRules.filter((r) => r.kind === 'style');

  /* ---- tokens: contrast between named colour pairs ---- */
  const tokens = {};
  for (const r of styleRules) if (/^:root$/.test(r.selector)) for (const d of r.decls) if (d.prop.startsWith('--')) tokens[d.prop] = d.value;
  for (const pair of rules.contrast || []) {
    const fg = hexToRgb(tokens[pair.fg] || ''), bg = hexToRgb(tokens[pair.bg] || '');
    if (!fg || !bg) { add('token-missing', 'hard', 'design-rules.json', `${pair.fg} on ${pair.bg}: token not found as a #hex in :root`); continue; }
    const ratio = contrast(fg, bg);
    /* "known": a pair that fails today and is tracked as a todo. It is held by the ratchet
       (it may not get worse) and a note is printed when it starts passing. */
    if (ratio < pair.min) add(pair.known ? 'token-contrast-known' : 'token-contrast', pair.known ? 'ratchet' : 'hard', `${pair.fg} on ${pair.bg}`, `${ratio.toFixed(2)}:1, needs ${pair.min}:1 (${pair.use})${pair.known ? '; known gap, ' + pair.known : ''}`);
    else if (pair.known) add('token-contrast-known-fixed', 'hard', `${pair.fg} on ${pair.bg}`, `now passes (${ratio.toFixed(2)}:1): remove "known" from this pair in design-rules.json`);
  }

  /* ---- CSS rules ---- */
  const FLOOR = rules.minFontPx ?? 14;
  const MAX_TRACKING = rules.maxLetterSpacingEm ?? 0.12;
  let usesAnimation = false, smoothScroll = false, reducedBlock = false, reducedHasScroll = false;
  for (const r of allRules) {
    if (r.kind === 'keyframes') usesAnimation = true;
    if (r.kind !== 'style') continue;
    const inReduced = r.atStack.some((a) => /prefers-reduced-motion\s*:\s*reduce/.test(a));
    const d = Object.fromEntries(r.decls.map((x) => [x.prop, x.value]));
    if (inReduced) { reducedBlock = true; if ('scroll-behavior' in d) reducedHasScroll = true; }
    if (/^animation(-name)?$/m.test(r.decls.map((x) => x.prop).join('\n')) && !inReduced) usesAnimation = true;
    if (/smooth/.test(d['scroll-behavior'] || '') && !inReduced) smoothScroll = true;

    const fs = d['font-size'] ? fontPx(d['font-size']) : null;
    if (fs !== null && fs < FLOOR) add('font-size-floor', 'ratchet', `${r.src}: ${r.selector.slice(0, 60)}`, `font-size ${d['font-size']} = ${fs}px, minimum ${FLOOR}px`);
    if (d['letter-spacing'] && fs !== null && fs < 16) {
      const em = emOf(d['letter-spacing']);
      if (em !== null && em > MAX_TRACKING) add('letter-spacing-cap', 'ratchet', `${r.src}: ${r.selector.slice(0, 60)}`, `letter-spacing ${d['letter-spacing']} on ${fs}px text, maximum ${MAX_TRACKING}em`);
    }
    for (const x of r.decls) {
      if (x.prop === 'outline' && /^(none|0)$/i.test(x.value) || x.prop === 'outline-style' && /^none$/i.test(x.value)) {
        const replaced = r.decls.some((y) => /^(box-shadow|border|border-color|background|background-color|text-decoration)$/.test(y.prop));
        if (!replaced) add('focus-indicator-removed', 'hard', `${r.src}: ${r.selector.slice(0, 60)}`, `${x.prop}: ${x.value} with no replacement indicator in the same rule`);
      }
      if (x.prop.startsWith('--') || !COLOR_PROPS.test(x.prop)) continue;
      if (/^:root$/.test(r.selector)) continue;
      const v = x.value.replace(/var\([^)]*\)/g, '');
      if (COLOR_LITERAL.test(v) && !NEUTRAL_OVERLAY.test(v.replace(/#[0-9a-f]{3,8}\b/gi, 'X')) ) add('color-literal', 'ratchet', `${r.src}: ${r.selector.slice(0, 60)}`, `${x.prop}: ${x.value.slice(0, 60)}`);
    }
  }
  if (usesAnimation && !reducedBlock) add('reduced-motion-missing', 'hard', 'css', 'animations are used but there is no @media (prefers-reduced-motion: reduce) block');
  if (smoothScroll && !reducedHasScroll) add('reduced-motion-scroll', 'hard', 'css', 'scroll-behavior: smooth is set but the reduced-motion block does not reset it');

  /* ---- JS files: absolute hosts ---- */
  const hostOk = (host) => (rules.allowedHosts || []).some((h) => host === h || host.endsWith('.' + h));
  const checkUrls = (text, where) => {
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)(?::\d+)?/gi)) {
      if (!hostOk(m[1].toLowerCase())) add('third-party-host', 'hard', where, `${m[0]} is not in allowedHosts (privacy promises depend on this list)`);
    }
  };
  for (const f of files.filter((x) => x.endsWith('.js') || x.endsWith('.css'))) checkUrls(readFileSync(join(dir, f), 'utf8'), f);

  /* ---- HTML pages ---- */
  const banned = (rules.bannedClaims || []).map((p) => p.toLowerCase());
  const allowed = new Set((rules.allowedClaims || []).map((a) => a.phrase.toLowerCase()));
  for (const f of htmlFiles) {
    const html = readFileSync(join(dir, f), 'utf8');
    const head = html.slice(0, html.search(/<\/head>/i) + 1 || 0);

    if (!/<html[^>]*\slang\s*=\s*["'][a-z]/i.test(html)) add('html-lang', 'hard', f, '<html> has no lang attribute');
    const vp = html.match(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i);
    if (!vp) add('viewport-meta', 'hard', f, 'no viewport meta tag');
    else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp[0])) add('zoom-locked', 'hard', f, 'viewport meta blocks pinch zoom (WCAG 1.4.4)');

    const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const heads = [...body.matchAll(/<h([1-6])\b/gi)].map((m) => +m[1]);
    if (heads.filter((h) => h === 1).length !== 1) add('h1-count', 'hard', f, `${heads.filter((h) => h === 1).length} <h1> elements, expected exactly 1`);
    heads.forEach((h, i) => { if (i && h > heads[i - 1] + 1) add('heading-skip', 'hard', f, `h${heads[i - 1]} followed by h${h}`); });

    for (const m of body.matchAll(/<img\b[^>]*>/gi)) if (!hasAttr(m[0], 'alt')) add('img-alt', 'hard', f, `<img> without alt: ${m[0].slice(0, 70)}`);
    for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
      if (/target\s*=\s*["']?_blank/i.test(m[0]) && !/rel\s*=\s*["'][^"']*noopener/i.test(m[0])) add('blank-no-noopener', 'hard', f, m[0].slice(0, 90));
      if (/amazon\.[a-z.]+\/(dp|gp)\//i.test(m[0]) && /tag=/.test(m[0]) && !/rel\s*=\s*["'][^"']*sponsored/i.test(m[0])) add('affiliate-no-sponsored', 'hard', f, m[0].slice(0, 90));
    }
    for (const m of body.matchAll(/<(a|button|input|form|div|span|section)\b[^>]*\son[a-z]+\s*=/gi)) add('inline-handler', 'hard', f, `inline event handler: ${m[0].slice(0, 70)}`);
    for (const m of body.matchAll(/\stabindex\s*=\s*["']?(\d+)/gi)) if (+m[1] > 0) add('tabindex-positive', 'hard', f, `tabindex="${m[1]}" breaks the natural focus order`);
    const ids = [...body.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => add('duplicate-id', 'hard', f, `id="${id}" used more than once`));
    const labelFor = new Set([...body.matchAll(/<label\b[^>]*\sfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
    for (const m of body.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const t = (attr(m[0], 'type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(t)) continue;
      const id = attr(m[0], 'id');
      if (!(id && labelFor.has(id)) && !hasAttr(m[0], 'aria-label') && !hasAttr(m[0], 'aria-labelledby')) add('input-label', 'hard', f, `form field without a label: ${m[0].slice(0, 80)}`);
    }
    for (const m of body.matchAll(/<(a|button)\b[^>]*>\s*<\/\1>/gi)) add('empty-control', 'hard', f, `link or button with no content: ${m[0].slice(0, 60)}`);
    const inlineStyles = [...body.matchAll(/<(?!svg|path|g\b|rect|circle|line|ellipse|use|text)([a-z0-9]+)\b[^>]*\sstyle\s*=/gi)].length;
    for (let i = 0; i < inlineStyles; i++) add('inline-style', 'ratchet', f, 'style="" attribute; use a class and a token');

    /* scripts: no third-party <script src> (they would load before consent), and inline code may only talk to allowed hosts */
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = attr(m[0], 'src'), type = (attr(m[0], 'type') || '').toLowerCase();
      if (src && /^(https?:)?\/\//.test(src)) add('external-script-tag', 'hard', f, `${src}: load third-party scripts only from analytics.js, behind consent`);
      if (!src && type !== 'application/ld+json' && m[2].trim()) checkUrls(m[2], `${f} <script>`);
    }
    const noLd = (t) => t.replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][\s\S]*?<\/script>/gi, ''); // structured data names schema.org, which is a vocabulary, not a request
    checkUrls(noLd(body), f);
    checkUrls(noLd(head).replace(/<script\b[\s\S]*?<\/script>/gi, ''), f);

    /* claims: visible text and the description/OG text in <head> */
    const text = (stripTags(body) + ' ' + [...head.matchAll(/<meta[^>]*(?:name|property)\s*=\s*["'](?:description|og:description|twitter:description|og:title|twitter:title)["'][^>]*content\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(' ')).toLowerCase();
    for (const phrase of banned) {
      if (allowed.has(phrase)) continue;
      const re = new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
      if (re.test(text)) add('banned-claim', 'hard', f, `"${phrase}": ${rules.claimsHelp || 'see docs/DESIGN.md, Voice and claims'}`);
    }
  }
  return findings;
}

/* ── ratchet and report ───────────────────────────────────────────────────── */

export function evaluate(findings, baseline = {}) {
  const hard = findings.filter((f) => f.level === 'hard');
  const counts = {};
  findings.filter((f) => f.level === 'ratchet').forEach((f) => { counts[f.id] = (counts[f.id] || 0) + 1; });
  const base = baseline.static || {};
  const over = Object.keys(counts).filter((id) => counts[id] > (base[id] || 0));
  const under = Object.keys({ ...base, ...counts }).filter((id) => (counts[id] || 0) < (base[id] || 0));
  return { hard, counts, over, under, ok: hard.length === 0 && over.length === 0 };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'dist'));
  const rulesPath = join(root, 'design-rules.json'), basePath = join(root, 'design-baseline.json');
  if (!existsSync(dir)) { console.error(`check-design: ${dir} not found. Run the build first.`); process.exit(2); }
  const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
  const baseline = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {};
  const findings = analyze(dir, rules);
  const res = evaluate(findings, baseline);

  if (args.includes('--update-baseline')) {
    baseline._readme = baseline._readme || 'Known legacy design problems, held so they cannot grow. Lower a number when you fix some; never raise one. See docs/DESIGN.md.';
    baseline.static = Object.fromEntries(Object.entries(res.counts).sort());
    writeFileSync(basePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log('check-design: baseline written', JSON.stringify(baseline.static));
    return;
  }

  const byId = (list) => list.reduce((m, f) => ((m[f.id] = m[f.id] || []).push(f), m), {});
  for (const [id, list] of Object.entries(byId(res.hard))) {
    console.error(`\n✗ ${id} (${list.length})`);
    list.slice(0, 8).forEach((f) => console.error(`    ${f.where}: ${f.detail}`));
    if (list.length > 8) console.error(`    … and ${list.length - 8} more`);
  }
  for (const id of res.over) {
    const list = findings.filter((f) => f.id === id);
    console.error(`\n✗ ${id}: ${list.length} found, baseline allows ${(baseline.static || {})[id] || 0}. New violations were added; fix them or use a token/size that passes.`);
    list.slice(-8).forEach((f) => console.error(`    ${f.where}: ${f.detail}`));
  }
  for (const id of res.under) console.log(`ℹ ${id}: ${res.counts[id] || 0} now, baseline ${(baseline.static || {})[id]}. Lower it: node scripts/check-design.mjs --update-baseline`);
  const summary = Object.entries(res.counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  if (!res.ok) { console.error(`\ncheck-design: FAILED (${res.hard.length} hard, ratchet over: ${res.over.join(', ') || 'none'})`); process.exit(1); }
  console.log(`check-design: ok (${relative(root, dir) || '.'}; legacy held by baseline: ${summary})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
