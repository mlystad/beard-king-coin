#!/usr/bin/env node
/*
 * Builds the Firebase Hosting copy of the site into dist/. No dependencies.
 *
 * The files at the repository root are the site as written, and stay valid
 * as-is (that is what the current host serves). The build only switches on
 * the features that need Firebase:
 *
 *   SIGNUP_MODE        google-form | api      api posts to /api/signup (the shared function)
 *   EMAIL_PROVIDER     mailchimp | none       wording about the confirmation email
 *   GA_MEASUREMENT_ID  G-XXXXXXX              adds GA4 with the consent notice
 *   CONTACT_EMAIL      hello@...              shown in the privacy notice
 *
 * Conditional text in the HTML:
 *   <!--unless:flag-->shown unless flag<!--/unless:flag-->
 *   <!--when:flag shown only when flag -->
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const env = (k, d = '') => (process.env[k] || d).trim();
const fail = (m) => { console.error(`build: ${m}`); process.exit(1); };

const mode = env('SIGNUP_MODE', 'google-form');
const provider = env('EMAIL_PROVIDER', 'none');
const gaId = env('GA_MEASUREMENT_ID');
const contact = env('CONTACT_EMAIL');
if (!['google-form', 'api'].includes(mode)) fail(`SIGNUP_MODE must be google-form or api, got ${mode}`);
if (!['mailchimp', 'none'].includes(provider)) fail(`EMAIL_PROVIDER must be mailchimp or none, got ${provider}`);
if (gaId && !/^G-[A-Z0-9]{4,}$/.test(gaId)) fail(`GA_MEASUREMENT_ID looks wrong: ${gaId}`);
if (contact && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(contact)) fail(`CONTACT_EMAIL looks wrong: ${contact}`);

const flags = new Set([
  ...(mode === 'api' ? ['api'] : []),
  ...(mode === 'api' && provider === 'mailchimp' ? ['mailchimp'] : []),
  ...(gaId ? ['analytics'] : []),
  ...(contact ? ['contact'] : []),
]);

function render(html, file) {
  html = html.replace(/<!--unless:([a-z]+)-->([\s\S]*?)<!--\/unless:\1-->/g, (_, f, body) => (flags.has(f) ? '' : body));
  html = html.replace(/<!--when:([a-z]+) ([\s\S]*?) -->/g, (_, f, body) => (flags.has(f) ? body : ''));
  html = html.split('%CONTACT_EMAIL%').join(contact);
  if (mode === 'api' && file === 'index.html') {
    const before = html;
    html = html.replace(/(<form id="email-form" action=")[^"]+(" method="POST" novalidate data-signup=")google-form(")/, '$1/api/signup$2api$3');
    if (html === before) fail('could not switch the pledge form to api mode');
  }
  if (gaId) {
    html = html.replace('</head>', `<meta name="ga-id" content="${gaId}">\n<meta name="ga-linker" content="originalbeardking.com,itsthebeard.com">\n<script src="/analytics.js" defer></script>\n</head>`);
  }
  if (/<!--(when|unless):/.test(html)) fail('unmatched conditional comment');
  return html;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'privacy.html']) writeFileSync(join(out, f), render(readFileSync(join(root, f), 'utf8'), f));
for (const f of ['favicon.svg', 'og.png']) copyFileSync(join(root, f), join(out, f));
if (gaId) copyFileSync(join(root, 'analytics.js'), join(out, 'analytics.js'));
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://originalbeardking.com/sitemap.xml\n');
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://originalbeardking.com/</loc></url>
  <url><loc>https://originalbeardking.com/privacy</loc></url>
</urlset>
`);
console.log(`build: dist/ ready (signup=${mode}${mode === 'api' ? '/' + provider : ''}, analytics=${gaId ? 'on' : 'off'}, contact=${contact ? 'on' : 'off'})`);
