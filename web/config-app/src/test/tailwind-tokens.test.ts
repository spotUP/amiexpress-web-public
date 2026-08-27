import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - the Tailwind config is plain JavaScript with no type declaration
import tailwindConfig from '../../tailwind.config.js';

const SRC_DIR = resolve(__dirname, '..');

/** Every `bbs-*` name Tailwind knows about, from the single source of truth. */
const definedColors = new Set(
  Object.keys((tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>)
);

/** `text-bbs-muted`, `hover:bg-bbs-secondary/80`, `divide-bbs-border` -> `bbs-muted` etc. */
const BBS_CLASS = /\bbbs-[a-z][a-z0-9-]*/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    // The tests themselves name colours in assertions; they are not consumers.
    if (full === resolve(SRC_DIR, 'test')) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css|html)$/.test(entry) ? [full] : [];
  });
}

describe('Tailwind bbs-* colour tokens', () => {
  it('defines every bbs-* colour the admin pages use', () => {
    const missing = new Map<string, string[]>();

    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.match(BBS_CLASS) ?? []) {
        if (definedColors.has(match)) continue;
        const users = missing.get(match) ?? [];
        const relative = file.slice(SRC_DIR.length + 1);
        if (!users.includes(relative)) users.push(relative);
        missing.set(match, users);
      }
    }

    const report = [...missing.entries()]
      .map(([name, files]) => `${name} (used in ${files.join(', ')})`)
      .join('\n');

    expect(report, `Undefined colours compile to nothing:\n${report}`).toBe('');
  });

  it('resolves every theme value to a custom property declared in tokens.css', () => {
    // A misspelled var name still compiles; the element just renders with no
    // colour at all. This catches that at test time instead of on screen.
    const tokensCss = readFileSync(resolve(SRC_DIR, 'styles/tokens.css'), 'utf8');
    const declared = new Set(
      [...tokensCss.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1])
    );

    const configSource = readFileSync(resolve(SRC_DIR, '..', 'tailwind.config.js'), 'utf8');
    const referenced = new Set(
      [...configSource.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1])
    );
    // `token('surface-0')` builds the var name from a bare token name.
    for (const match of configSource.matchAll(/token\('([a-z0-9-]+)'\)/g)) {
      referenced.add(`--${match[1]}`);
    }

    const undeclared = [...referenced].filter((name) => !declared.has(name));
    expect(undeclared, `Not declared in tokens.css: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('keeps the five colours that were missing on 2026-08-27', () => {
    // These were used 122 times across 15 files while resolving to nothing.
    for (const name of ['bbs-border', 'bbs-secondary', 'bbs-background', 'bbs-hover', 'bbs-error']) {
      expect(definedColors.has(name), `${name} must stay defined`).toBe(true);
    }
  });
});
