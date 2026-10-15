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
import { readAdminSources } from './admin-sources';

const SOURCES = readAdminSources(/\.(ts|tsx|css)$/);

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
  // Edited IN THE ROW: a section's minimum level is typed into the cell, with
  // save and cancel beside it (AdminRolesPage.tsx:103-118). That is the grid
  // this exception is for, and it arrived after the list was written.
  'pages/AdminRolesPage.tsx',
  // Bulls.CFG's menu, edited IN THE ROW and addressed BY INDEX: the number
  // column IS the line the door reads, Remove drops draft[i], and "Add row"
  // appends a second blank {title,file} - so there is no stable row id to give
  // DataTable and no sort order that is not a corruption of the file.
  'pages/BullsInfoPage.tsx',
];

function offenders(pattern: RegExp): string[] {
  return SOURCES.flatMap(({ rel, text }) => {
    const hits = [...text.matchAll(pattern)].map(m => m[0]);
    return [...new Set(hits)].map(hit => `${rel}: ${hit}`);
  });
}

/**
 * Where the board's own font belongs: the token file that defines it, and the
 * character picker, which shows the glyphs a sysop is about to draw with.
 */
const TOPAZ_SURFACES = [
  'styles/tokens.css',
  'components/ScreenEditor.tsx',
  // FILE_ID.DIZ / DIR descriptions - board art, shown on File lists.
  'components/BoardText.tsx',
];

describe('every admin page', () => {
  it('names no colour outside the token ramp', () => {
    const found = offenders(PALETTE);

    expect(found, found.join('\n')).toEqual([]);
  });

  it('has stopped using the legacy bbs-* aliases', () => {
    const found = offenders(LEGACY_ALIAS);

    expect(found, found.join('\n')).toEqual([]);
  });

  /**
   * Topaz is the BOARD's font. Asked for in those terms - "dont use topaz for
   * the ui only for the art" - after one `font-topaz` on the screen editor's
   * <section> pushed it onto every label and button inside, and the MCI codes
   * listed under the art in that face read as part of the drawing rather than
   * as controls.
   *
   * The art itself does not need the class: the canvas names Topaz in
   * `ctx.font`. What is left is the character picker, whose cells ARE board
   * glyphs - a sysop is choosing the character that lands on the screen, so it
   * has to be shown in the face the board will draw it in.
   */
  it('keeps Topaz for the art, not the interface', () => {
    const found = SOURCES
      .filter(({ text }) => /font-topaz/.test(text))
      .map(({ rel }) => rel)
      .filter(rel => !TOPAZ_SURFACES.includes(rel));

    expect(found, found.join('\n')).toEqual([]);
  });

  /**
   * A FIELD THE THEME DOES NOT REACH IS A LIGHT-MODE FIELD.
   *
   * An unstyled `<select>` or `<input>` is not invisible and not obviously
   * wrong on a developer's machine - the browser draws its own control, which
   * on this dark admin means white on white. It shipped because the class was
   * spelled `input` and the design system's is `input-field`: a name that
   * does not exist applies nothing, and nothing is what the browser styles.
   * "can you do something so you stop adding light mode components everytime
   * i ask for new stuff for the admin ui?" (sysop, 2026-09-14).
   *
   * So: every text-ish input, select and textarea carries a class that
   * reaches the theme. `input-field` is the design system's; a component may
   * also build the classes in a variable, which is why a className that is an
   * expression rather than a literal string is accepted - it cannot be read
   * here, and the palette rules above already cover what it can contain.
   */
  it('gives every field a class the theme reaches', () => {
    // <input type="checkbox"> and type="radio" draw from the accent colour,
    // not from a field background; they are not what this is about.
    const SKIP_TYPES = /type=["'](?:checkbox|radio|hidden|file|range|color)["']/;
    /** The design system's field class, or the tokens it is built from. */
    const THEMED = /\b(?:input-field|bg-surface-\d|bg-transparent|text-content-|border-border)/;
    const found: string[] = [];

    /**
     * The attributes of one JSX tag, brace-aware.
     *
     * `[^>]*` cannot be used: `onChange={(e) => ...}` contains a `>` and the
     * match stops there, before the className - which reported every
     * correctly styled field on the page as unstyled.
     */
    const attributesAt = (text: string, from: number): string => {
      let depth = 0;
      let quote: string | null = null;
      for (let i = from; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0) return text.slice(from, i);
      }
      return text.slice(from);
    };

    for (const source of SOURCES) {
      if (!/\.tsx$/.test(source.rel)) continue;
      // Comments first: this file's own doc comments talk ABOUT `<input
      // type="number">`, and prose is not a control. Replaced with spaces so
      // the offsets - and so the reported lines - stay true.
      const text = source.text
        .replace(/\/\*[\s\S]*?\*\//g, blank => blank.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, blank => ' '.repeat(blank.length));
      for (const match of text.matchAll(/<(select|textarea|input)\b/g)) {
        const tag = match[1];
        const attrs = attributesAt(text, match.index! + match[0].length);
        if (SKIP_TYPES.test(attrs)) continue;

        const className = /className=(?:"([^"]*)"|\{)/.exec(attrs);
        const where = `${source.rel}: <${tag}>`;
        if (!className) { found.push(`${where} has no className at all`); continue; }
        // An expression builds its classes elsewhere, and the palette rules
        // above cover what it may build them from.
        if (className[1] === undefined) continue;
        // Either the design system's own field class, or the tokens it is
        // made of. What is NOT acceptable is a field dressed only in layout
        // - `w-full px-2` leaves the browser to colour it, and the browser
        // colours it for a light page.
        if (!THEMED.test(className[1])) {
          found.push(`${where} className="${className[1]}" reaches no theme colour`);
        }
      }
    }

    expect(found, found.join('\n')).toEqual([]);
  });

  it('renders tables through DataTable, except the grids that are edited', () => {
    const found = SOURCES
      .filter(({ text }) => /<table[\s>]/.test(text))
      .map(({ rel }) => rel)
      .filter(rel => !EDITABLE_GRIDS.includes(rel));

    expect(found, found.join('\n')).toEqual([]);
  });
});
