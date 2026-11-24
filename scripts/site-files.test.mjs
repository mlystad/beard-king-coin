/*
 * The files search engines and visitors rely on: robots.txt, sitemap.xml and the 404 page.
 * The site is served straight from the repository root, so they must exist there, and the
 * Firebase build must carry the same ones. Coin repository only.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIsolated } from './build-fixture.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://originalbeardking.com';
const built = buildIsolated();
after(() => built.cleanup());

for (const [label, dir] of [['live files (repository root)', root], ['Firebase build', built.dir]]) {
  test(`${label}: robots.txt allows crawling and names the sitemap`, () => {
    assert.ok(existsSync(join(dir, 'robots.txt')), 'robots.txt is missing');
    const t = readFileSync(join(dir, 'robots.txt'), 'utf8');
    assert.match(t, /^User-agent: \*$/m); assert.match(t, /^Allow: \/$/m);
    assert.match(t, new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
    assert.doesNotMatch(t, /^Disallow:\s*\/\s*$/m, 'robots.txt must not block the whole site');
  });

  test(`${label}: sitemap.xml lists exactly the pages that can be indexed`, () => {
    assert.ok(existsSync(join(dir, 'sitemap.xml')), 'sitemap.xml is missing');
    const listed = [...readFileSync(join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const pages = readdirSync(dir).filter((f) => f.endsWith('.html') && f !== '404.html')
      .map((f) => (f === 'index.html' ? `${SITE}/` : `${SITE}/${f.replace(/\.html$/, '')}`)).sort();
    assert.deepEqual(listed, pages);
  });

  test(`${label}: the 404 page exists, is kept out of search, and leads home`, () => {
    assert.ok(existsSync(join(dir, '404.html')), '404.html is missing');
    const h = readFileSync(join(dir, '404.html'), 'utf8');
    assert.match(h, /<meta name="robots" content="noindex"/);
    assert.equal((h.match(/<h1\b/g) || []).length, 1);
    assert.match(h, /<a [^>]*href="\/"/, 'a link back to the home page');
    assert.doesNotMatch(h, /rel="canonical"/, 'a 404 page has no canonical address');
  });
}
