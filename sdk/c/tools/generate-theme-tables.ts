/**
 * Generate sdk/c/include/theme_tables.h from the TypeScript themes.
 *
 * The plan's own answer to "how do a C door and a TypeScript door stay the
 * same board": tokens.ts stays the single source of truth and the C table is
 * GENERATED from it, the same trick the door delete rules use. A token change
 * is one edit plus a regenerate, and sdk/c/tests/test_ui_theme.c plus the
 * freshness check in the Makefile mean the two cannot drift in silence.
 *
 * The reduction: six of the seven themes carry hex, and a C door has eight
 * colours. Each token is mapped to the nearest of the eight by RGB distance,
 * which keeps a theme's INTENT - phosphor stays green, neon stays magenta -
 * without pretending the Amiga can render the exact shade.
 *
 *   npx tsx c/tools/generate-theme-tables.ts        # writes the header
 *   npx tsx c/tools/generate-theme-tables.ts --check  # fails if it is stale
 */

import * as fs from 'fs';
import * as path from 'path';

import { THEMES, type Theme, type ThemeTokens } from '../../engines/ui/theme';

/** The eight ANSI colours a C door has, as the RGB a terminal draws. */
const ANSI: Array<{ name: string; c: number; rgb: [number, number, number] }> = [
  { name: 'ANSI_BLACK',   c: 0, rgb: [0, 0, 0] },
  { name: 'ANSI_RED',     c: 1, rgb: [170, 0, 0] },
  { name: 'ANSI_GREEN',   c: 2, rgb: [0, 170, 0] },
  { name: 'ANSI_YELLOW',  c: 3, rgb: [170, 85, 0] },
  { name: 'ANSI_BLUE',    c: 4, rgb: [0, 0, 170] },
  { name: 'ANSI_MAGENTA', c: 5, rgb: [170, 0, 170] },
  { name: 'ANSI_CYAN',    c: 6, rgb: [0, 170, 170] },
  { name: 'ANSI_WHITE',   c: 7, rgb: [170, 170, 170] },
];

/** blessed's colour names, for the classic theme, which uses no hex. */
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], red: [170, 0, 0], green: [0, 170, 0], yellow: [170, 85, 0],
  blue: [0, 0, 170], magenta: [170, 0, 170], cyan: [0, 170, 170], white: [170, 170, 170],
  gray: [85, 85, 85], grey: [85, 85, 85],
  lightblack: [85, 85, 85], lightred: [255, 85, 85], lightgreen: [85, 255, 85],
  lightyellow: [255, 255, 85], lightblue: [85, 85, 255], lightmagenta: [255, 85, 255],
  lightcyan: [85, 255, 255], lightwhite: [255, 255, 255],
};

function rgbOf(value: string): [number, number, number] {
  const named = NAMED[value.toLowerCase()];
  if (named) return named;

  const hex = value.replace('#', '');
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  // Unknown spelling: white is the safe answer - readable on every ground.
  return [170, 170, 170];
}

/**
 * The hue circle, cut into the six chromatic colours a C door has.
 *
 * SECTORS, not nearest-neighbour, because two reductions went visibly wrong
 * under distance rules and both were the metric's fault rather than the
 * palette's:
 *
 *  - RGB distance made 'gray' (85,85,85) YELLOW, since ANSI yellow
 *    (170,85,0) is numerically nearer than white. A dim row rendered yellow
 *    is not a shade off, it is a different thing on screen.
 *  - Hue distance made neon's #FF3D9A (hue 331) RED, because red sits 29
 *    away and magenta 31 - a tie decided by rounding, on a colour every
 *    viewer would call pink.
 *
 * The boundaries below are where a viewer stops calling it one and starts
 * calling it the other. Note 15-45 is orange and lands on ANSI yellow,
 * whose real hue is 30, not 60 - the palette's "yellow" is a brown-orange.
 */
const HUE_SECTORS: Array<{ upTo: number; name: string; c: number }> = [
  { upTo: 15,  name: 'ANSI_RED',     c: 1 },
  { upTo: 90,  name: 'ANSI_YELLOW',  c: 3 },
  { upTo: 150, name: 'ANSI_GREEN',   c: 2 },
  { upTo: 210, name: 'ANSI_CYAN',    c: 6 },
  { upTo: 270, name: 'ANSI_BLUE',    c: 4 },
  { upTo: 345, name: 'ANSI_MAGENTA', c: 5 },
  { upTo: 360, name: 'ANSI_RED',     c: 1 },
];

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return 0;

  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;

  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/**
 * One token, reduced to one of the eight colours.
 *
 * A colour with no real chroma is decided on brightness alone - and only
 * what is essentially the ground goes to black, because a `dim` that maps
 * onto the background is not dim, it is gone.
 */
function reduce(value: string): { name: string; c: number } {
  const [r, g, b] = rgbOf(value);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max - min < 40) {
    return max < 48
      ? { name: 'ANSI_BLACK', c: 0 }
      : { name: 'ANSI_WHITE', c: 7 };
  }

  const hue = hueOf(r, g, b);
  for (const sector of HUE_SECTORS) {
    if (hue < sector.upTo) return { name: sector.name, c: sector.c };
  }
  return { name: 'ANSI_WHITE', c: 7 };
}

const TOKEN_ORDER: Array<keyof ThemeTokens> = [
  'ground', 'ink', 'chrome', 'dim', 'bar', 'barInk',
  'accent', 'accentAlt', 'selectionBg', 'selectionInk', 'ok', 'warn', 'alert',
];

function cName(token: keyof ThemeTokens): string {
  return token.replace(/[A-Z]/g, (u) => `_${u.toLowerCase()}`);
}

function render(themes: readonly Theme[]): string {
  const rows = themes.map((theme) => {
    const fields = TOKEN_ORDER.map((token) => {
      const { name, c } = reduce(theme.tokens[token]);
      return `        /* ${cName(token).padEnd(13)} */ ${name},${' '.repeat(Math.max(1, 14 - name.length))}/* ${theme.tokens[token]} -> ${c} */`;
    }).join('\n');

    // Only 'none' survives as a distinction: ansi_box draws + - |, so a
    // theme asking for double rules gets line rules.
    const border = theme.border === 'none' ? 'UI_BORDER_NONE' : 'UI_BORDER_LINE';
    const rail = JSON.stringify(theme.rail ?? '');

    return `    {
        "${theme.id}",
        ${JSON.stringify(theme.name ?? theme.id)},
        ${JSON.stringify(theme.blurb ?? '')},
${fields}
        ${border},
        ${rail}
    }`;
  }).join(',\n');

  return `/*
 * theme_tables.h - GENERATED. Do not edit.
 *
 * Written by sdk/c/tools/generate-theme-tables.ts from
 * sdk/engines/ui/theme/tokens.ts, which stays the single source of truth for
 * what a theme IS. Each token is reduced to the nearest of the eight colours
 * a C door has, by RGB distance, so a theme keeps its intent - phosphor stays
 * green, neon stays magenta - without pretending the Amiga can render the
 * exact shade.
 *
 * Regenerate:  cd sdk && npx tsx c/tools/generate-theme-tables.ts
 * Check:       ... --check   (fails when this file is stale)
 */

#ifndef UI_THEME_TABLES_H
#define UI_THEME_TABLES_H

#define UI_THEME_COUNT ${themes.length}

static const ui_theme UI_THEME_TABLE[UI_THEME_COUNT] = {
${rows}
};

#endif /* UI_THEME_TABLES_H */
`;
}

const target = path.resolve(__dirname, '..', 'include', 'theme_tables.h');
const generated = render(THEMES);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== generated) {
    console.error(
      '[STALE] sdk/c/include/theme_tables.h does not match sdk/engines/ui/theme/tokens.ts.\n'
      + '        Run: cd sdk && npx tsx c/tools/generate-theme-tables.ts',
    );
    process.exit(1);
  }
  console.log('[OK] theme_tables.h is current');
} else {
  fs.writeFileSync(target, generated);
  console.log(`[OK] wrote ${path.relative(process.cwd(), target)} (${THEMES.length} themes)`);
}
