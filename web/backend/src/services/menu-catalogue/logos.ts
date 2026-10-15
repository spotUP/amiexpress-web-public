/**
 * The logos a menu shows (plan Decisions 16, 29, 30): chosen per open from the
 * sysop's sets, measured, and drawn by the board into the door's screen.
 *
 * Files live in Screens/menus/<kind>/logos/ (menuLogoDir) and are read through
 * amigafs as latin1: `.txt` is Amiga ANSI, `.seq` is PETSCII for the C64.
 */
import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { parseAnsiToGrid, gridSize, renderGridAt } from '../../utils/screen-wipe.util';
import { menuLogoDir } from '../menu-config.service';
import { levelEntry, widthClassOf, type MenuConfig, type MenuKind, type LogoSet } from '../../screens/menu-config/menu-config';
import { PetsciiMachine, PUA_BANK0, PUA_BANK1, vicToSgrForeground } from '@amiexpress/bbs-door-sdk/petscii';
import type { ChosenLogo, MenuCaller } from './types';

const ANSI_LOGO_COLUMNS = 200;
const SCREEN_CODE_SPACE = 0x20;

/** "Rotate in order": board-wide, in memory, reset at restart (Decision 30). */
const rotation = new Map<string, number>();

const isSeq = (file: string) => file.toLowerCase().endsWith('.seq');
const readLatin1 = (file: string): string => (amigafs.readFileSync(file, 'latin1') as string);

/** A PETSCII file as the screen it paints: the KERNAL model, not a byte count. */
function seqScreen(file: string): PetsciiMachine {
  const machine = new PetsciiMachine();
  const buf = amigafs.readFileSync(file) as Buffer;
  machine.feed(buf);
  return machine;
}

function seqExtent(machine: PetsciiMachine): { rows: number; cols: number } {
  const { screen, cols, rows } = machine.state;
  let lastRow = -1, lastCol = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (screen[y * cols + x] !== SCREEN_CODE_SPACE) { lastRow = y; lastCol = Math.max(lastCol, x); }
  }
  return { rows: lastRow + 1, cols: lastCol + 1 };
}

export function measureLogo(file: string): { rows: number; cols: number } {
  return isSeq(file) ? seqExtent(seqScreen(file)) : gridSize(parseAnsiToGrid(readLatin1(file), ANSI_LOGO_COLUMNS));
}

function pick(set: LogoSet, key: string, usable: string[]): string {
  if (set.rule === 'fixed') return usable[0];
  if (set.rule === 'random') return usable[Math.floor(Math.random() * usable.length)];
  const next = rotation.get(key) ?? 0;
  rotation.set(key, next + 1);
  return usable[next % usable.length];
}

export function chooseLogos(config: MenuConfig, kind: MenuKind, caller: MenuCaller, bbsRoot: string): ChosenLogo[] {
  const cls = widthClassOf(caller.columns);
  const dir = menuLogoDir(bbsRoot, kind);
  const chosen: ChosenLogo[] = [];
  for (const position of ['header', 'footer', 'side', 'between'] as const) {
    if (position === 'side' && cls !== 'wide') continue;           // Decision 16: side panels are for wide screens
    const byFloor: Record<string, LogoSet> = {};
    for (const set of config.logos) if (set.position === position && set.widthClass === cls) byFloor[String(set.levelFloor)] = set;
    const set = levelEntry(byFloor, caller.secLevel);
    if (!set) continue;
    // Decision 16: a logo wider than the screen is never drawn, so it is never a candidate.
    const fits = set.files.flatMap(file => {
      try { const m = measureLogo(path.join(dir, file)); return m.rows > 0 && m.cols > 0 && m.cols <= caller.columns ? [{ file, ...m }] : []; }
      catch { return []; }
    });
    if (fits.length === 0) continue;
    const file = pick(set, `${kind}:${position}:${set.widthClass}:${set.levelFloor}`, fits.map(f => f.file));
    const m = fits.find(f => f.file === file)!;
    chosen.push({ position, file, rows: m.rows, cols: m.cols, afterSection: set.afterSection });
  }
  return chosen;
}

/** A C64 picture as positioned ANSI the transducer maps back to the same screen codes (Decision 29). */
function seqToAnsi(machine: PetsciiMachine, top: number, left: number, rows: number, cols: number): string {
  const { screen, colorRam, charsetBank } = machine.state;
  const base = charsetBank === 1 ? PUA_BANK1 : PUA_BANK0;
  const width = machine.state.cols;
  let out = '';
  for (let y = 0; y < rows; y++) {
    let end = Math.min(cols, width);
    while (end > 0 && screen[y * width + end - 1] === SCREEN_CODE_SPACE) end--;
    out += `\x1b[${top + y};${left}H`;
    let pen = -1;
    for (let x = 0; x < end; x++) {
      const sc = screen[y * width + x];
      if (sc === SCREEN_CODE_SPACE) { out += ' '; continue; }
      const vic = colorRam[y * width + x];
      if (vic !== pen) { out += vicToSgrForeground(vic); pen = vic; }
      out += String.fromCodePoint(base + sc);          // bit 7 = reverse, carried by the codepoint
    }
  }
  return out + '\x1b[0m';
}

/** The logo as text for the door's output path, or null when it does not fit its box (never drawn partly). */
export function renderLogoAt(bbsRoot: string, kind: MenuKind, logo: ChosenLogo, top: number, left: number, maxRows: number, maxCols: number): string | null {
  if (logo.rows > maxRows || logo.cols > maxCols) return null;
  const file = path.join(menuLogoDir(bbsRoot, kind), logo.file);
  try {
    if (isSeq(file)) return seqToAnsi(seqScreen(file), top, left, logo.rows, logo.cols);
    return renderGridAt(parseAnsiToGrid(readLatin1(file), ANSI_LOGO_COLUMNS), top, left, logo.rows, logo.cols);
  } catch { return null; }
}
