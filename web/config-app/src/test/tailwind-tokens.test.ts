import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// The Tailwind config is plain JavaScript. It used to need a @ts-expect-error
// here; the project now compiles with allowJs (the vendored RIP renderer is
// JavaScript too), so tsc infers its shape and the suppression would be an
// unused directive.
import tailwindConfig from '../../tailwind.config.js';

import { readAdminSources, SRC as SRC_DIR } from './admin-sources';

/** Every `bbs-*` name Tailwind knows about, from the single source of truth. */
const definedColors = new Set(
  Object.keys(tailwindConfig.theme?.extend?.colors ?? {})
);

/**
 * `text-bbs-muted`, `hover:bg-bbs-secondary/80`, `divide-bbs-border` ->
 * `bbs-muted` and so on. The utility prefix is required so a prose mention of
 * a filename such as bbs-event-emitter.ts is not read as a class name.
 */
const BBS_CLASS =
  /\b(?:bg|text|border|divide|ring|outline|shadow|fill|stroke|caret|accent|decoration|placeholder|from|via|to)-(bbs-[a-z][a-z0-9-]*)/g;

/** Read once, while the file is collected - see admin-sources.ts. */
const SOURCES = readAdminSources(/\.(ts|tsx|css|html)$/);

describe('Tailwind bbs-* colour tokens', () => {
  it('defines every bbs-* colour the admin pages use', () => {
    const missing = new Map<string, string[]>();

    for (const { rel: relative, text } of SOURCES) {
      for (const match of text.matchAll(BBS_CLASS)) {
        const name = match[1];
        if (definedColors.has(name)) continue;
        const users = missing.get(name) ?? [];
        if (!users.includes(relative)) users.push(relative);
        missing.set(name, users);
      }
    }

    const report = [...missing.entries()]
      .map(([name, files]) => `${name} (used in ${files.join(', ')})`)
      .join('\n');

    expect(report, `Undefined colours compile to nothing:\n${report}`).toBe('');
  });

  /**
   * The ramp namespaces, not just the legacy bbs-* aliases.
   *
   * `bg-surface-raised` shipped in the door settings form and rendered with no
   * background at all - white fields in a dark admin - because `surface` has
   * numbered steps and no `raised`. The guard above only knew about bbs-*, so
   * nothing caught it. A misspelt token compiles to nothing and fails silently
   * on screen; that is exactly what a test is for.
   */
  it('defines every surface/content/status step the admin pages use', () => {
    const colors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, unknown>;
    const steps = (family: string) => {
      const value = colors[family];
      return new Set(
        value && typeof value === 'object' ? Object.keys(value as Record<string, string>) : []
      );
    };
    const known: Record<string, Set<string>> = {
      surface: steps('surface'),
      content: steps('content'),
      status: steps('status'),
    };

    const RAMP_CLASS =
      /\b(?:bg|text|border|divide|ring|outline|shadow|fill|stroke|caret|accent|decoration|placeholder|from|via|to)-(surface|content|status)-([a-z0-9]+(?:-[a-z0-9]+)*)/g;

    const missing = new Map<string, string[]>();
    for (const { rel: relative, text } of SOURCES) {
      for (const match of text.matchAll(RAMP_CLASS)) {
        const [, family, step] = match;
        // `bg-surface-2/40` and the like: the opacity suffix is not the step.
        const name = step.split('/')[0];
        if (known[family].has(name)) continue;
        const key = `${family}-${name}`;
        const users = missing.get(key) ?? [];
        if (!users.includes(relative)) users.push(relative);
        missing.set(key, users);
      }
    }

    const report = [...missing.entries()]
      .map(([name, files]) => `${name} (used in ${files.join(', ')})`)
      .join('\n');

    expect(report, `Undefined ramp steps compile to nothing:\n${report}`).toBe('');
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
