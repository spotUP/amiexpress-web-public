/**
 * Super Qix - Background art
 *
 * The arcade original hides a picture behind the playfield and reveals it as
 * you claim area. This does the same with the ANSI art in backgrounds/.
 *
 * The art is 80 columns wide and the grid is 40 logical cells at CELL_WIDTH
 * characters each, so one logical cell covers exactly two adjacent art
 * columns. Each of those columns keeps its own glyph and colours - a cell is
 * revealed as the two characters that were always there, not as an average
 * of them.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadFile } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/file-ops';
import { ART_WIDTH, ART_HEIGHT, CELL_WIDTH } from './constants';

/** One character of the art: what to draw and how to colour it. */
export interface ArtCell {
  char: string;
  /** Colour indices 0-15, as the ANSI art itself defines them. */
  fg: number;
  bg: number;
}

/** A loaded picture, already cropped to the playfield. */
export interface Background {
  name: string;
  /** [row][column], ART_HEIGHT rows of ART_WIDTH columns. */
  cells: ArtCell[][];
}

const BLANK: ArtCell = { char: ' ', fg: 7, bg: 0 };

/**
 * Where the art lives.
 *
 * Resolved from this file rather than the working directory: the backend
 * runs with cwd web/backend, so a cwd-relative path would look in the wrong
 * tree entirely (the same mistake that stopped Arkanoid's highscores from
 * surviving a deploy). __dirname is <door>/game in dev and <door>/dist/game
 * once compiled, so walk up to the directory holding backgrounds/.
 */
function backgroundsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'backgrounds');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(__dirname, 'backgrounds');
}

/**
 * Every usable art file, in a stable order.
 *
 * Sorted by filename so a given level always shows the same picture: the
 * board is shared, and a scoreboard is easier to compare when everyone met
 * the same level. Only .ans and .asc - the .xb pieces carry their own font,
 * which a terminal cannot load, so they would render as the wrong glyphs.
 */
export function listBackgrounds(): string[] {
  const dir = backgroundsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(name => /\.(ans|asc)$/i.test(name))
    .sort();
}

/**
 * Load the art for a level. Level 1 gets the first file, and the list wraps
 * once there are more levels than pictures.
 *
 * Returns null when there is no art to show; the caller then draws the plain
 * playfield, so a board with an empty backgrounds/ directory still works.
 */
export async function loadBackgroundForLevel(level: number): Promise<Background | null> {
  const names = listBackgrounds();
  if (names.length === 0) return null;

  const name = names[(Math.max(1, level) - 1) % names.length];

  try {
    const data = new Uint8Array(fs.readFileSync(path.join(backgroundsDir(), name)));
    const loaded = await loadFile(data, name);
    return { name, cells: cropToField(loaded.canvas) };
  } catch (error) {
    console.error(`[Super Qix] Could not load background ${name}:`, error);
    return null;
  }
}

/**
 * Crop (and pad) a loaded canvas to exactly the playfield's art dimensions.
 *
 * Art is 25 rows and the field shows 20, so the bottom rows are dropped -
 * ANSI pieces put their signature there more often than their subject.
 */
function cropToField(canvas: Array<Array<{ char: string; fg: number; bg: number }>>): ArtCell[][] {
  const rows: ArtCell[][] = [];

  for (let y = 0; y < ART_HEIGHT; y++) {
    const source = canvas[y];
    const row: ArtCell[] = [];
    for (let x = 0; x < ART_WIDTH; x++) {
      const cell = source?.[x];
      if (!cell || !cell.char) {
        row.push({ ...BLANK });
        continue;
      }
      row.push({ char: cell.char, fg: cell.fg ?? 7, bg: cell.bg ?? 0 });
    }
    rows.push(row);
  }

  return rows;
}

/**
 * The CELL_WIDTH art characters that sit behind one logical cell.
 *
 * Always returns CELL_WIDTH entries so the renderer can paint a cell without
 * checking for gaps, whatever the art's real extent was.
 */
export function artForCell(background: Background | null, cellX: number, cellY: number): ArtCell[] {
  const out: ArtCell[] = [];
  const row = background?.cells[cellY];

  for (let i = 0; i < CELL_WIDTH; i++) {
    const cell = row?.[cellX * CELL_WIDTH + i];
    out.push(cell ? cell : { ...BLANK });
  }

  return out;
}
