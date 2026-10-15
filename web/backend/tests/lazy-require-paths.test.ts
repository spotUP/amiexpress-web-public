/**
 * Every lazy require() in the backend must point at a module that exists.
 *
 * A `require()` inside a function body is invisible to everything that
 * normally catches a bad path. The compiler does not check it, no import-time
 * check touches it, the server boots fine, and tests that import the target
 * module directly pass - so the first thing that notices is a user pressing
 * the key:
 *
 *   AmiExpress Web BBS [0:General] Menu (60 mins. left): a
 *   Error processing command.
 *
 *   Error: Cannot find module './alter-flags.handler'
 *
 * That was the A command. Sweeping the tree found 42 more of exactly the
 * same shape, in the chat, room, user, account, bulletin and navigation
 * handlers - each one a command that dies the moment somebody uses it.
 *
 * This test is the reason a 43rd cannot be added quietly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const SRC = path.resolve(__dirname, '../src');

/**
 * Paths with no module to point at.
 *
 * These would NOT be path typos - the target does not exist anywhere in the
 * tree, which makes each one a missing implementation rather than a broken
 * reference. The list must only ever shrink.
 *
 * It is empty: the one entry, system-commands.handler requiring
 * ../login.handler for handleLoginPrompt, was the broken relogon path and
 * is fixed - it enters the login state directly now.
 */
const KNOWN_MISSING: ReadonlyArray<{ file: string; spec: string; why: string }> = [];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') out.push(...sourceFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments before looking for requires.
 *
 * Without this the sweep reports `require('./ui/actions')` in
 * door.handler.ts, which is prose explaining the require cache, not code.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => {
      const at = line.indexOf('//');
      if (at === -1) return line;
      // Not a comment if the // sits inside a string - crude, but the only
      // thing that matters here is not losing a real require.
      const before = line.slice(0, at);
      const quotes = (before.match(/['"`]/g) || []).length;
      return quotes % 2 === 0 ? before : line;
    })
    .join('\n');
}

describe('every lazy require resolves', () => {
  const offenders: string[] = [];
  let checked = 0;

  beforeAll(() => {
    for (const file of sourceFiles(SRC)) {
      const req = createRequire(file);
      const text = stripComments(fs.readFileSync(file, 'utf-8'));
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
          checked++;
          try {
            req.resolve(m[1]);
          } catch {
            const rel = path.relative(SRC, file);
            const known = KNOWN_MISSING.some(k => k.file === rel && k.spec === m[1]);
            if (!known) offenders.push(`${rel}:${i + 1}  require('${m[1]}')`);
          }
        }
      });
    }
  });

  it('finds no unresolvable relative require', () => {
    expect(offenders).toEqual([]);
  });

  it('actually swept the tree', () => {
    // A sweep that silently matched nothing would pass the test above while
    // proving nothing at all.
    expect(checked).toBeGreaterThan(400);
  });
});
