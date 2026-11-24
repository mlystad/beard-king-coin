/*
 * Builds the site into its own temporary directory for tests, so tests never
 * share, wipe or overwrite dist/ (a developer's own build) and can run in parallel.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildIsolated(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bk-site-'));
  execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe', env: { ...process.env, ...env, OUT_DIR: dir } });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
