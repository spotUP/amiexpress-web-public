import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/** The admin app's source root. */
export const SRC = resolve(__dirname, '..');

export interface AdminSource {
  /** Path relative to `src/`, e.g. `pages/BullsInfoPage.tsx`. */
  rel: string;
  text: string;
}

/**
 * Every admin source file whose name matches `extensions`, read once.
 *
 * The design-system checks scan the whole tree. Read inside a test body, each
 * scan walked and read every file again under the per-test timeout, so on a
 * loaded machine the push gate failed with "Test timed out in 5000ms" while no
 * rule was broken. Call this at module scope: the reading happens while the
 * file is collected, and the tests only match text in memory.
 *
 * `src/test` is left out: the tests name classes in assertions; they are not
 * consumers. So is `node_modules` (vite keeps a cache under `src/`).
 */
export function readAdminSources(extensions: RegExp): AdminSource[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry);
      if (full === resolve(SRC, 'test') || entry === 'node_modules') return [];
      if (statSync(full).isDirectory()) return walk(full);
      return extensions.test(entry) ? [full] : [];
    });
  return walk(SRC).map(file => ({ rel: file.slice(SRC.length + 1), text: readFileSync(file, 'utf8') }));
}
