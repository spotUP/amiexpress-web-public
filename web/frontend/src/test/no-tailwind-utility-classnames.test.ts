/**
 * No Tailwind-shaped utility classes in className literals.
 *
 * On 2026-09-03 the PETSCII screen sat pinned in the top-left corner of the
 * board because BBSTerminal's fixed-mode wrapper declared its centring as
 * `flex items-center justify-center` in its className. Neither web/frontend
 * nor packages/terminal ships Tailwind - no dependency, no config, no
 * `@tailwind` directive, and nothing defining `.flex` / `.items-center` in
 * index.css, App.css or index.html - so those class names resolved to
 * NOTHING. The layout they described was never applied, and the comment
 * above them ("the canvas already centres itself") was believed for a day.
 *
 * A class name that no stylesheet defines is invisible: it type-checks, it
 * renders, it reviews clean, and it does nothing. This test is the guard -
 * the same job design-system-usage.test.ts does for web/config-app. Layout
 * in these two trees belongs in a real stylesheet (TerminalPage.css,
 * index.css) or in an inline style; if Tailwind is ever genuinely adopted
 * here, delete this test in the commit that adds the dependency.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.resolve(here, '..'),                                  // web/frontend/src
  path.resolve(here, '../../../../packages/terminal/src'),   // the terminal package
];

/** Third-party code we do not author (RIPtermJS et al). */
const SKIP_DIR = /(^|\/)(node_modules|dist|vendor|__tests__)$/;
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$/;

/**
 * Utility-class shapes, matched per whitespace-separated token so a real BEM
 * name is never mistaken for one: `terminal-page--framed` is fine,
 * `flex` is not.
 */
const TAILWIND_TOKEN = /^(min-h-|max-h-|min-w-|max-w-|w-full$|h-full$|w-screen$|h-screen$|flex$|flex-|grid$|items-|justify-|self-|p-\d|px-\d|py-\d|pt-\d|pb-\d|pl-\d|pr-\d|m-\d|mx-\d|my-\d|mt-\d|mb-\d|ml-\d|mr-\d|gap-|space-[xy]-)/;

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.test(full)) sources(full, found);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !SKIP_FILE.test(entry)) found.push(full);
  }
  return found;
}

/** Comments describe the bug; only code can carry it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Every string or template literal that belongs to a `className`, including
 * the branches of a ternary. Interpolations are dropped - `${className}` is
 * a value, not a literal class name.
 */
function classNameLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /className\s*[=:]\s*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const window = src.slice(match.index, match.index + 400);
    for (const literal of window.matchAll(/`([^`]*)`|'([^']*)'|"([^"]*)"/g)) {
      out.push((literal[1] ?? literal[2] ?? literal[3] ?? '').replace(/\$\{[^}]*\}/g, ' '));
    }
  }
  return out;
}

describe('no Tailwind-shaped utility classes in className literals', () => {
  it('every className token in web/frontend and packages/terminal resolves to a real stylesheet rule', () => {
    const offences: string[] = [];

    for (const root of ROOTS) {
      for (const file of sources(root)) {
        const src = stripComments(readFileSync(file, 'utf8'));
        for (const literal of classNameLiterals(src)) {
          for (const token of literal.split(/\s+/)) {
            if (token && TAILWIND_TOKEN.test(token)) {
              offences.push(`${path.relative(root, file)}: ${token}`);
            }
          }
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
