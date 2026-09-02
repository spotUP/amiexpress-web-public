/**
 * The admin uses the design system. Everywhere.
 *
 * Asked for in exactly those terms after a page shipped with `text-red-400`
 * and `text-amber-400` in it: "design system are meant to be used. everywhere.
 * no exceptions. ever."
 *
 * Three rules, each with a failure that is invisible on a developer's machine:
 *
 * - A raw Tailwind palette class (`text-red-400`) renders fine and ignores the
 *   token ramp, so a palette change reaches every page except the ones that
 *   spelled a colour out.
 * - The legacy `bbs-*` names are aliases onto that same ramp, kept so 28 pages
 *   could be converted gradually. They are converted now; new uses would start
 *   the drift again.
 * - A hand-rolled `<table>` has none of DataTable's sorting, empty state or
 *   error state - and the empty state is what once rendered "No doors
 *   configured" for a request that had FAILED.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    // The tests name these classes in assertions; they are not consumers.
    if (full === resolve(SRC, 'test')) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(entry) ? [full] : [];
  });
}

const UTILITY = 'bg|text|border|divide|ring|outline|shadow|fill|stroke|caret|accent|decoration|placeholder|from|via|to';

const PALETTE = new RegExp(
  `\\b(?:${UTILITY})-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone)-\\d{2,3}\\b`,
  'g',
);
const LEGACY_ALIAS = new RegExp(`\\b(?:${UTILITY})-bbs-[a-z][a-z0-9-]*`, 'g');

/**
 * Tables that are EDITED rather than read.
 *
 * DataTable owns sorting and row identity, so a grid whose rows are inputs
 * addressed by index cannot use it without losing the edit. Node Configuration
 * keeps DataGrid for the same reason - a decision, recorded, not an oversight.
 */
const EDITABLE_GRIDS = [
  'components/ui/DataTable.tsx',
  'components/DataGrid.tsx',
  'pages/DoorsPage.tsx',
];

function offenders(pattern: RegExp): string[] {
  return sourceFiles(SRC).flatMap(file => {
    const hits = [...readFileSync(file, 'utf8').matchAll(pattern)].map(m => m[0]);
    return [...new Set(hits)].map(hit => `${file.slice(SRC.length + 1)}: ${hit}`);
  });
}

describe('every admin page', () => {
  it('names no colour outside the token ramp', () => {
    const found = offenders(PALETTE);

    expect(found, found.join('\n')).toEqual([]);
  });

  it('has stopped using the legacy bbs-* aliases', () => {
    const found = offenders(LEGACY_ALIAS);

    expect(found, found.join('\n')).toEqual([]);
  });

  it('renders tables through DataTable, except the grids that are edited', () => {
    const found = sourceFiles(SRC)
      .filter(file => /<table[\s>]/.test(readFileSync(file, 'utf8')))
      .map(file => file.slice(SRC.length + 1))
      .filter(rel => !EDITABLE_GRIDS.includes(rel));

    expect(found, found.join('\n')).toEqual([]);
  });
});
