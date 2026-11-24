#!/usr/bin/env node
/*
 * Checks the built site in dist/ (or the directory given as the first argument):
 *   - every internal link and asset resolves (clean URLs: /x -> x.html),
 *   - every #fragment exists on its target page,
 *   - no placeholder text slipped through.
 * Exits non-zero with a list of problems.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
const problems = [];
const htmlFiles = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.html'));
const idsCache = new Map();

function ids(file) {
  if (!idsCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
}

function resolveTarget(fromFile, url) {
  const path = url.startsWith('/') ? join(dir, url) : join(dirname(fromFile), url);
  for (const c of [path, path + '.html', join(path, 'index.html')]) {
    if (existsSync(c) && statSync(c).isFile()) { return c; }
  }
  return null;
}

for (const rel of htmlFiles) {
  const file = join(dir, rel);
  const html = readFileSync(file, 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ''); // inline code may say "undefined"
  for (const bad of ['YOUR_', 'TODO', 'undefined', '<!--@']) {
    if (text.includes(bad)) { problems.push(`${rel}: contains "${bad}"`); }
  }
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(ref) || ref.startsWith('//')) { continue; }
    const [path, frag] = ref.split('#');
    const target = path === '' ? file : resolveTarget(file, path.split('?')[0]);
    if (!target) { problems.push(`${rel}: broken link ${ref}`); continue; }
    if (frag && target.endsWith('.html') && !ids(target).has(frag)) {
      problems.push(`${rel}: ${ref} -> no id="${frag}" in ${relative(dir, target)}`);
    }
  }
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log(`check-dist: ${htmlFiles.length} pages, all links and fragments resolve`);
