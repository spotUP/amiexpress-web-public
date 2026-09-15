/**
 * Default 40-column PETSCII screens, generated from the board's own ANSI ones.
 *
 * WHY. `loadScreenFile` prefers `<stem>.seq` for a 40-column PETSCII caller
 * (screen.handler.ts:1603-1637) and the board carries exactly two of them -
 * BBSTITLE and the logoff pool. Every other screen reaches a C64 either
 * reflowed (prose) or, when it is 80-column art, replaced by
 * `[80-COLUMN ANSI SCREEN - SKIPPED]`. The sysop's words, 2026-09-15:
 * "this will be easier to use if you create default screens for all missing
 * petscii screens".
 *
 * WHAT THIS IS NOT. Not a runtime fallback: the files land on disk beside
 * their ANSI originals so the sysop can open each one in the admin PETSCII
 * editor and make it his. A generated screen is a FIRST DRAFT, and the
 * generator is re-runnable (`--force`) for the ones he has not touched.
 *
 * THE PIPELINE, entirely out of parts that already exist:
 *
 *   bytes -> readAmigaTextFileWithTransforms   (the loader's own decoder:
 *                                               SAUCE, CP437 vs latin-1, iCE)
 *        -> FrameReconstructor(80 x N)         (the C64 door adapter's ANSI
 *                                               replay; SGR resolves to VIC)
 *        -> art blocks judged and banners cut  (this file, see below)
 *        -> adaptRows(cols: 40)                (the adapter's rule ladder:
 *                                               deindent/stat/narrow/reflow)
 *        -> cells painted onto a PetsciiMachine surface
 *        -> writeSeq                           (the editor's own .seq writer)
 *
 * THE ONE JUDGEMENT THIS FILE MAKES. An 80-column ANSI logo cannot become a
 * 40-column one by any mechanical rule - half of it is half a picture. So a
 * run of art rows is measured: if every row of it fits in 40 columns once the
 * run's common indent is gone, the ladder keeps it (that is most Amiga logos,
 * which are drawn centred inside 80). If it does not fit, the run is replaced
 * by a PETSCII masthead naming the screen. Text rows are never dropped.
 *
 * A `.seq` goes RAW to the wire (screen.handler.ts:2489) - no MCI pass, no
 * pause - so a screen that would need more than 25 rows is NOT written: those
 * keep the reflow path, which pages properly. `--report` lists them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

import { FrameReconstructor } from '../../sdk/petscii/frame/ansi-screen';
import { adaptRows, RegionPin } from '../../sdk/petscii/frame/adapt';
import { wrapLineToWidth } from '../../sdk/petscii/wrap';
import { Cell, blankCell, isBlank, padRow } from '../../sdk/petscii/frame/types';
import { blankSurface, conformToBoard } from '../../sdk/petscii/editor-surface';
import { writeSeq } from '../../sdk/petscii/seq-writer';
import { asciiToPetsciiByte } from '../../sdk/petscii/ascii-to-petscii';
import { printablePetsciiToScreenCode } from '../../sdk/petscii/screen-codes';
import { readAmigaTextFileWithTransforms } from '../../web/backend/src/utils/amiga-text-decode.util';
import { looksLikeAsciiArt } from '../../web/backend/src/utils/ascii-art.util';
import { screenIsProgram } from '../../web/backend/src/screens/screen-blankness';

const ROOT = path.resolve(__dirname, '..', '..');
export const SCREEN_COLS = 40;
export const SCREEN_ROWS = 25;

/** VIC indices used by a generated masthead. */
const BAR_COLOR = 3;    // cyan
const TITLE_COLOR = 1;  // white

/** Board directories the screen loader searches (screen-resolution.ts:236-278). */
const BOARD_DIRS = /^(Screens\/|Node\d+\/|Conf\d+\/|Bulletins\/|Themes\/)/;
const SCREEN_EXT = /\.(txt|ans)$/i;

/**
 * SCREENS THE BOARD WRITES ITSELF GET NO COMPANION, and this is the one rule
 * here that is about correctness rather than taste.
 *
 * `<stem>.seq` is resolved BEFORE `<stem>.txt` for a 40-column caller. For a
 * hand-drawn screen that is the point; for a generated one it is a bug with a
 * long fuse - the .txt is rewritten (MultiTop rewrites bull1-6 at every
 * logoff, `utils/multitop-generator.ts:451`; the achievements board rewrites
 * `Screens/AchieveTop.txt`, `achievements/bulletin.ts:315`; the news tick
 * rewrites bull7/bull8, `services/news-bulletins.ts:403`; `ctop-updater`
 * rewrites the conference tops) and the frozen .seq beside it keeps showing
 * last week's numbers to exactly the callers who cannot see the real ones.
 *
 * Those screens already reach a C64 through the reflow path, which reads the
 * file every time.
 */
const MACHINE_WRITTEN = [
  /(^|\/)bull\d+\.txt$/i,
  /(^|\/)BullHelp\.txt$/i,
  /(^|\/)AchieveTop\.txt$/i,
  /(^|\/)conftop\.txt$/i,
  /(^|\/)ctop\.txt$/i,
  /(^|\/)lastc\.txt$/i,
  /(^|\/)README[^/]*$/i,        // documentation that happens to live in Themes/
];

/**
 * A SCREEN WITH A POOL IS ALREADY ANSWERED, and a flat companion beside it
 * takes the caller AWAY from the pool.
 *
 * `Screens/logoff/001.logoff.seq`..`003` are three hand-drawn PETSCII
 * screens the board picks between at random (`~SR_`, the numbered pool that
 * `formatNumberedFilename` builds). Generating `Node1/Logoff.seq` from
 * `Node1/Logoff.txt` put a masthead in the node directory, which the resolver
 * reaches FIRST - so a C64 caller stopped seeing the artist's goodbye screens
 * and started seeing a generated title bar. (Caught by
 * `tests/petscii/logoff-seq-data.test.ts`, which pins the file the resolver
 * settles on.)
 *
 * So any stem that names a pool directory under `Screens/` is left alone. The
 * pool's own members still get companions - they are the art.
 */
export function poolNames(root = ROOT): Set<string> {
  const screens = path.join(root, 'Screens');
  const names = new Set<string>();
  if (!fs.existsSync(screens)) return names;
  for (const entry of fs.readdirSync(screens, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const numbered = new RegExp(`^\\d{1,3}\\.${entry.name}\\.`, 'i');
    if (fs.readdirSync(path.join(screens, entry.name)).some((f) => numbered.test(f))) names.add(entry.name.toLowerCase());
  }
  return names;
}

export function isMachineWritten(file: string): boolean {
  return MACHINE_WRITTEN.some((pattern) => pattern.test(file));
}

export interface GenerateOptions {
  force?: boolean;
  dryRun?: boolean;
  maxRows?: number;
}

export interface ScreenOutcome {
  source: string;
  target: string;
  status: 'written' | 'exists' | 'edited' | 'too-tall' | 'empty' | 'program';
  rows: number;
  banner: boolean;
  bytes: number;
}

/**
 * THE MANIFEST IS WHAT MAKES `--force` SAFE, and it exists because the first
 * run of this script did the thing it guards against: `--force` skipped the
 * "already has one" test, and on a case-insensitive filesystem
 * `Node0/BBSTITLE.seq` IS `Node0/BBSTITLE.SEQ` - forty-four hand-drawn
 * screens, the board's own titles among them, overwritten by a generated
 * three-row masthead. (Restored from HEAD, which the live volume agrees
 * with byte for byte.)
 *
 * So: a target is only ever overwritten when its bytes are still EXACTLY the
 * bytes this script last wrote there. A screen the sysop has since drawn on
 * is 'edited' and skipped; a screen this script never wrote is 'exists' and
 * skipped. Neither answer depends on the filesystem's idea of case.
 */
const MANIFEST = 'dev/scripts/petscii-defaults.manifest.json';

export function readManifest(root = ROOT): Record<string, string> {
  const file = path.join(root, MANIFEST);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

const sha = (bytes: Buffer | Uint8Array): string => crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex');

/**
 * What to do about a target that already exists: 'write' only for a file
 * still holding the exact bytes this script last wrote there.
 */
export function overwriteDecision(
  existingBytes: Buffer | Uint8Array | null,
  target: string,
  manifest: Record<string, string>,
  force: boolean
): 'write' | 'exists' | 'edited' {
  if (!existingBytes) return 'write';
  const ours = manifest[target] === sha(existingBytes);
  if (!ours) return 'edited';
  return force ? 'write' : 'exists';
}

/** The .seq that answers for this screen today, whatever case it is spelled in. */
export function existingCompanion(absolute: string): string | null {
  const stem = absolute.replace(SCREEN_EXT, '');
  for (const candidate of [stem + '.seq', stem + '.SEQ']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** The screens a 40-column caller could ask for, minus the ones already answered. */
export function candidateScreens(root = ROOT): string[] {
  const tracked = execSync('git ls-files', { cwd: root, maxBuffer: 1 << 28 }).toString().split('\n');
  const pools = poolNames(root);
  return tracked.filter(
    (f) =>
      f &&
      BOARD_DIRS.test(f) &&
      SCREEN_EXT.test(f) &&
      !f.includes('.Revisions/') &&
      !isMachineWritten(f) &&
      !pools.has(path.basename(f).replace(SCREEN_EXT, '').toLowerCase())
  );
}

/** `<stem>.seq`, the name the loader looks for first. */
export function seqPathFor(file: string): string {
  return file.replace(SCREEN_EXT, '.seq');
}

export function hasPetsciiCompanion(absolute: string): boolean {
  const stem = absolute.replace(SCREEN_EXT, '');
  return fs.existsSync(stem + '.seq') || fs.existsSync(stem + '.SEQ');
}

/**
 * MCI display directives on lines of their own (`~WX` the wipe, `~f` the
 * clear) are dropped: a `.seq` is not run through the MCI pass unless it
 * opens with the gate, and an ungated `~WX` reaches a C64 as the letters WX
 * (seq-writer.ts:44-52).
 */
export function stripDirectiveLines(text: string): { text: string; mciRemains: boolean } {
  const kept = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(~[A-Za-z0-9|]+\s*)+$/.test(line));
  return { text: kept.join('\r\n'), mciRemains: /~[A-Za-z]/.test(kept.join('')) };
}

const rowText = (cells: ReadonlyArray<Readonly<Cell>>): string =>
  cells.map((c) => c.ch).join('').replace(/\s+$/, '');

/** Leading blanks common to every non-blank row of a block - what `deindent` would remove. */
function commonIndent(rows: string[]): number {
  let indent = Infinity;
  for (const r of rows) {
    if (!r.trim()) continue;
    indent = Math.min(indent, r.length - r.replace(/^ +/, '').length);
  }
  return Number.isFinite(indent) ? indent : 0;
}

/**
 * Does this run of art rows survive the move to 40 columns? Only if every row
 * of it ends by column 40 once the run's own indent is gone. Judged over the
 * WHOLE run, never row by row: half a logo is not a logo.
 */
export function artFitsNarrow(rows: string[], cols = SCREEN_COLS): boolean {
  const indent = commonIndent(rows);
  return rows.every((r) => r.replace(/\s+$/, '').length - indent <= cols);
}

const cellOf = (ch: string, fg: number, rvs = false): Cell => ({ ...blankCell(), ch, fg, rvs });

/** A three-row PETSCII masthead: a bar, the screen's name, a bar. */
export function mastheadRows(title: string, cols = SCREEN_COLS): Cell[][] {
  const bar = (): Cell[] => Array.from({ length: cols }, () => cellOf(' ', BAR_COLOR, true));
  const name = title.slice(0, cols - 2);
  const pad = Math.max(0, Math.floor((cols - name.length) / 2));
  const middle: Cell[] = Array.from({ length: cols }, () => cellOf(' ', TITLE_COLOR));
  for (let i = 0; i < name.length; i++) middle[pad + i] = cellOf(name[i], TITLE_COLOR);
  return [bar(), middle, bar()];
}

/** Known screens read better under their own name than under their filename. */
const TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^guestlogon$/i, 'GUEST LOGON'],
  [/^logon24hrs$/i, '24 HOUR LIMIT'],
  [/^logon\d*$/i, 'WELCOME'],
  [/^login$/i, 'WELCOME'],
  [/^logoff$/i, 'GOODBYE'],
  [/^menu\d*$/i, 'MAIN MENU'],
  [/^joinconf$/i, 'JOIN CONFERENCE'],
  [/^joinmsgbase$/i, 'JOIN MESSAGE BASE'],
  [/^join$/i, 'JOIN CONFERENCE'],
  [/^onenode$/i, 'ALREADY ONLINE'],
  [/^mailscan$/i, 'MAIL SCAN'],
  [/^newuserpw$/i, 'NEW USER'],
  [/^uploadmsg$/i, 'UPLOAD'],
  [/^downloadmsg$/i, 'DOWNLOAD'],
  [/^-?filehelp$/i, 'FILE HELP'],
  [/^lastc$/i, 'LAST CALLERS'],
  [/^requests$/i, 'REQUESTS'],
  [/^privacy$/i, 'PRIVACY'],
  [/^bullhelp$/i, 'BULLETIN HELP'],
  [/^bull$/i, 'BULLETINS'],
  [/^bull(\d+)$/i, 'BULLETIN $1'],
  [/^conftop$/i, 'CONFERENCE'],
  [/^awaitscreen$/i, 'CONNECT'],
];

export function titleFor(stem: string): string {
  const base = stem.replace(/^\d+\./, '');
  for (const [pattern, title] of TITLES) {
    const m = base.match(pattern);
    if (m) return title.replace('$1', m[1] ?? '');
  }
  return base.replace(/[_-]+/g, ' ').toUpperCase().slice(0, SCREEN_COLS - 2);
}

/**
 * The 80-column frame with its opening LOGO replaced by a masthead.
 *
 * Only the first block, and only when it does not fit: a logo is the one
 * thing on a board screen that is pure decoration, and an 80-column one
 * cannot become a 40-column one by any rule - half a picture is not a
 * picture. Everything after it is CONTENT, art-looking or not, and goes to
 * the ladder whole. (Written the other way first: every art-looking run was
 * replaced, and Conf1's menu lost its REQ, TLIST and ULIST commands to a run
 * of dot-leader rows the detector reads as art.)
 */
export function bannerize(frame: { rows: number; cells: ReadonlyArray<ReadonlyArray<Readonly<Cell>>> }, title: string): { rows: Cell[][]; banner: boolean } {
  const out: Cell[][] = [];
  const text = (y: number) => rowText(frame.cells[y]);

  let first = 0;
  while (first < frame.rows && !text(first).trim()) first++;

  let end = first;
  while (end < frame.rows && (looksLikeAsciiArt(text(end)) || !text(end).trim())) end++;

  const run: string[] = [];
  for (let i = first; i < end; i++) run.push(text(i));
  const replace = run.length > 0 && !artFitsNarrow(run);

  if (replace) out.push(...mastheadRows(title));
  for (let y = replace ? end : 0; y < frame.rows; y++) out.push(frame.cells[y].map((c) => ({ ...c })));
  return { rows: out, banner: replace };
}

/**
 * A MENU is a list of commands, not a row of text, and that is the whole
 * reason this pass exists.
 *
 * express.e menus paint three dot-leader columns across 80 columns:
 *   `  [E].......eNTER MESSAGE  [FR]......rEVERSE FILES  [G]......gOODBYE`
 * At 40 columns the ladder's `narrow` rung keeps the row on one row and pays
 * for it in truncation - `[E].......e> [FR]......rE> [G].........>` - and
 * `split` would sever a command from its label. Neither is a menu.
 *
 * Re-laying it is: the entries are harvested in source order, the dots (which
 * mean nothing - they are a rule drawn to tie the atom to its label, the same
 * argument `leaderRow` makes) are dropped, and the entries are packed into as
 * many 40-column columns as the widest of them allows. Colours come from the
 * source cells, so a board whose brackets are red keeps red brackets.
 */
export interface MenuEntry { cmd: string; label: string; bracket: number; cmdColor: number; labelColor: number; }

const ENTRY = /\[([^\]]{1,8})\][.\u00b7\s]*([^\[]{1,40}?)(?=\s\s|\s*$)/g;

export function menuEntries(rows: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>): MenuEntry[] {
  const found: MenuEntry[] = [];
  for (const cells of rows) {
    const line = cells.map((c) => c.ch).join('');
    ENTRY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENTRY.exec(line)) !== null) {
      const label = m[2].trim().replace(/^[.\u00b7\-]+\s*/, '').trim();
      if (!label) continue;
      const at = m.index;
      found.push({
        cmd: m[1],
        label,
        bracket: cells[at]?.fg ?? 1,
        cmdColor: cells[at + 1]?.fg ?? 1,
        labelColor: cells[line.indexOf(label, at)]?.fg ?? 1,
      });
    }
  }
  return found;
}

/** How many of a menu's rows are entry rows - the test for "this screen IS a menu". */
export function isMenuScreen(rows: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>): boolean {
  const entryRows = rows.filter((cells) => {
    const line = cells.map((c) => c.ch).join('');
    ENTRY.lastIndex = 0;
    let count = 0;
    while (ENTRY.exec(line) !== null) count++;
    return count >= 2;
  });
  return entryRows.length >= 3;
}

/**
 * The entries packed into 40-column rows, greedily, in source order.
 *
 * Greedy rather than a fixed grid: one long entry - `[TLIST] gLOBAL BBS LIST`
 * is 23 columns - would set a grid's column width and leave the screen one
 * command per row, 32 rows for a menu that fits in 16. Every character of
 * every entry survives; what varies is where the second column starts.
 */
export function menuLayout(entries: MenuEntry[], cols = SCREEN_COLS): Cell[][] {
  const widthOf = (e: MenuEntry) => e.cmd.length + 3 + e.label.length;
  const out: Cell[][] = [];
  let row: Cell[] | null = null;
  let x = 0;
  for (const entry of entries) {
    const width = widthOf(entry);
    if (row && x + width > cols) { out.push(row); row = null; }
    if (!row) { row = Array.from({ length: cols }, () => blankCell()); x = 0; }
    const put = (ch: string, fg: number) => { if (x < cols) row![x++] = cellOf(ch, fg); };
    put('[', entry.bracket);
    for (const ch of entry.cmd) put(ch, entry.cmdColor);
    put(']', entry.bracket);
    put(' ', entry.labelColor);
    for (const ch of entry.label.slice(0, cols - x)) put(ch, entry.labelColor);
    x += 1;   // one blank between entries
  }
  if (row) out.push(row);
  return out;
}

/**
 * Runs of two or more entry rows replaced by the packed menu layout; every
 * other row untouched. A run rather than the whole screen because a menu
 * carries rules, a title and a status line that are not commands.
 */
export function relayoutMenuRows(rows: Cell[][], cols = SCREEN_COLS): { rows: Cell[][]; relaid: boolean } {
  const entryCount = (cells: ReadonlyArray<Readonly<Cell>>) => {
    const line = cells.map((c) => c.ch).join('');
    ENTRY.lastIndex = 0;
    let count = 0;
    while (ENTRY.exec(line) !== null) count++;
    return count;
  };
  const out: Cell[][] = [];
  let relaid = false;
  let y = 0;
  while (y < rows.length) {
    if (entryCount(rows[y]) < 2) { out.push(rows[y]); y++; continue; }
    let end = y;
    while (end < rows.length && entryCount(rows[end]) >= 1) end++;
    const entries = menuEntries(rows.slice(y, end));
    if (entries.length >= 2) { out.push(...menuLayout(entries, cols)); relaid = true; }
    else for (let i = y; i < end; i++) out.push(rows[i]);
    y = end;
  }
  return { rows: out, relaid };
}

/**
 * A box drawn across 60 or 70 columns cannot be redrawn across 40, and what
 * is INSIDE it always can: `Screens/ONENODE.TXT` frames two sentences in a
 * 60-column box, and the ladder - which sees a row beginning and ending in
 * `|` as a table - truncated both sentences with `>` and kept the borders.
 * So the borders come off before the ladder ever sees the block, and the
 * sentences go on to reflow as sentences.
 */
const BOX_TOP = /^[\u250c\u2554+][\u2500\u2550=\-]{4,}[\u2510\u2557+]$/;
const BOX_BOTTOM = /^[\u2514\u255a+][\u2500\u2550=\-]{4,}[\u2518\u255d+]$/;
const BOX_SIDE = /^[\u2502\u2551|](.*)[\u2502\u2551|]$/;

export function unwrapBoxes(rows: Cell[][]): Cell[][] {
  const out: Cell[][] = [];
  let y = 0;
  while (y < rows.length) {
    const trimmed = rowText(rows[y]).trim();
    if (!BOX_TOP.test(trimmed)) { out.push(rows[y]); y++; continue; }

    let end = y + 1;
    while (end < rows.length && BOX_SIDE.test(rowText(rows[end]).trim())) end++;
    if (end >= rows.length || !BOX_BOTTOM.test(rowText(rows[end]).trim())) { out.push(rows[y]); y++; continue; }

    for (let i = y + 1; i < end; i++) {
      const cells = rows[i];
      const first = cells.findIndex((c) => !isBlank(c));
      let last = cells.length - 1;
      while (last > first && isBlank(cells[last])) last--;
      out.push(padRow(cells.slice(first + 1, last), SCREEN_COLS * 2));
    }
    y = end + 1;
  }
  return out;
}

/**
 * Which rows are SENTENCES, so the ladder is told rather than left to guess.
 *
 * An Amiga screen's paragraph is JUSTIFIED - `This  is  NOT  a  warez  BBS` -
 * and those runs of blanks read to `recordRow` as a right-hand field and to
 * `narrowRow` as table gutters. Both then shorten the caller's own words.
 * `proseRow` is the rung that squeezes the padding out and wraps what is
 * left, and a pin is how a caller that KNOWS it is holding prose says so.
 */
export function proseRegions(rows: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>): RegionPin[] {
  const pins: RegionPin[] = [];
  rows.forEach((cells, y) => {
    const text = rowText(cells).trim();
    if (text.length < 24 || looksLikeAsciiArt(text)) return;
    if (/\[[^\]]{1,8}\]/.test(text)) return;                  // a command, not a sentence
    const words = text.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
    if (words.length < 4) return;
    const letters = (text.match(/[A-Za-z0-9 ,.'!?:;()-]/g) ?? []).length;
    if (letters / text.length < 0.85) return;
    pins.push({ rows: [y, y], rule: 'prose' });
  });
  return pins;
}

/**
 * A PARAGRAPH IS A PARAGRAPH, not five rows that each wrap on their own.
 *
 * The guest-logon text is one paragraph justified across 70 columns. Wrapping
 * it row by row - whatever rung does the wrapping - gives a 40-column screen
 * with a short line after every source row (`word of caution. This is`), the
 * ragged look of a document that has been folded rather than set. Consecutive
 * prose rows are therefore joined and re-wrapped as one, which is what a
 * 40-column board does with the same words.
 *
 * The paragraph's colour is the colour of its first ink: an Amiga screen
 * paints a block of prose in one pen, and a default screen the sysop is going
 * to edit anyway does not need per-word colour.
 */
export function reflowParagraphs(rows: Cell[][], pins: RegionPin[], cols = SCREEN_COLS): Cell[][] {
  const prose = new Set(pins.map((p) => p.rows[0]));
  const out: Cell[][] = [];
  let y = 0;
  while (y < rows.length) {
    if (!prose.has(y)) { out.push(rows[y]); y++; continue; }
    let end = y;
    const words: string[] = [];
    let color = rows[y].find((c) => !isBlank(c))?.fg ?? 1;
    while (end < rows.length && prose.has(end)) {
      words.push(rowText(rows[end]).trim());
      end++;
    }
    for (const line of wrapLineToWidth(words.join(' ').replace(/\s+/g, ' '), cols)) {
      out.push(padRow(Array.from(line).map((ch) => cellOf(ch, color)), cols));
    }
    y = end;
  }
  return out;
}

/** Adapted cells painted onto a C64 surface: glyph, reverse bit and colour. */
export function surfaceFromCells(rows: Cell[][], cols = SCREEN_COLS): ReturnType<typeof blankSurface> {
  // The board's own bank and background (editor-surface.ts:323-333): bank 1,
  // where a screen can carry BOTH cases - `[E] eNTER MESSAGE` is the board's
  // house style and bank 0 has no lowercase to fold it into.
  const surface = conformToBoard(blankSurface(cols, Math.max(1, rows.length)));
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = rows[y][x] ?? blankCell();
      const mapped = asciiToPetsciiByte(cell.ch.codePointAt(0) ?? 0x20, surface.charsetBank);
      const code = printablePetsciiToScreenCode(mapped.byte);
      // `needsReverse` is the table saying this glyph EXISTS only as the
      // inverse of another; a cell that also asks for reverse video cancels
      // back out. (ascii-to-petscii.ts:30-35.)
      const reverse = cell.rvs !== mapped.needsReverse;
      const index = y * cols + x;
      surface.screen[index] = (code & 0x7f) | (reverse ? 0x80 : 0);
      surface.colorRam[index] = cell.fg & 0x0f;
    }
  }
  return surface;
}

/** A screen neither opens nor ends on blank rows: trailing ones are a RETURN's job. */
function trimBlankRows(rows: Cell[][]): Cell[][] {
  const blank = (r: Cell[]) => r.every((c) => c.ch === ' ' && !c.rvs);
  let first = 0;
  let last = rows.length - 1;
  while (first <= last && blank(rows[first])) first++;
  while (last >= first && blank(rows[last])) last--;
  return rows.slice(first, last + 1);
}

export function generateSeqBytes(source: string, title: string, maxRows = SCREEN_ROWS): { bytes: Uint8Array | null; rows: number; banner: boolean } {
  const { text, mciRemains } = stripDirectiveLines(source);
  const lines = text.split(/\r?\n/);
  const reconstructor = new FrameReconstructor({ cols: 80, rows: Math.max(25, lines.length + 4) });
  reconstructor.write(text.replace(/\r?\n/g, '\r\n'));
  const frame = reconstructor.snapshot();

  const unwrapped = unwrapBoxes(frame.cells.map((row) => row.map((c) => ({ ...c }))));
  const { rows: bannered, banner } = bannerize({ rows: unwrapped.length, cells: unwrapped }, title);
  const { rows: menued } = relayoutMenuRows(bannered);
  const flowed = reflowParagraphs(menued, proseRegions(menued));
  const adapted = adaptRows(
    { cols: 80, rows: flowed.length, cells: flowed, cursor: { x: 0, y: 0 } },
    { cols: SCREEN_COLS }
  );
  const trimmed = trimBlankRows(adapted.rows.map((r) => r.cells));
  if (trimmed.length === 0) return { bytes: null, rows: 0, banner };
  if (trimmed.length > maxRows) return { bytes: null, rows: trimmed.length, banner };

  const surface = surfaceFromCells(trimmed);
  return { bytes: writeSeq(surface, { declareCharset: true, mciGate: mciRemains }), rows: trimmed.length, banner };
}

export function generateAll(options: GenerateOptions = {}, root = ROOT): ScreenOutcome[] {
  const maxRows = options.maxRows ?? SCREEN_ROWS;
  const manifest = readManifest(root);
  const outcomes: ScreenOutcome[] = [];
  for (const file of candidateScreens(root)) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const target = seqPathFor(file);
    const existing = existingCompanion(absolute);
    const decision = overwriteDecision(existing ? fs.readFileSync(existing) : null, target, manifest, options.force === true);
    if (decision !== 'write') {
      outcomes.push({ source: file, target, status: decision, rows: 0, banner: false, bytes: 0 });
      continue;
    }
    const decoded = readAmigaTextFileWithTransforms(absolute);
    /*
     * A SCREEN THAT DOES SOMETHING KEEPS DOING IT.
     *
     * `Node1/logon20.txt` is not art at all - it is five MCI directives
     * (`~CC_gl`, `~CC_gwall`, `~SR_...flt`, two `~SS_` includes). A `.seq`
     * runs its MCI only through the inline sentinel walker and carries
     * whatever the generator put in it, so a generated companion for a
     * program screen is a chance to drop an include and no chance to add
     * anything: there is no picture to adapt. `screenIsProgram` is the
     * board's own test (screens/screen-blankness.ts:128).
     */
    if (screenIsProgram(decoded.text)) {
      outcomes.push({ source: file, target, status: 'program', rows: 0, banner: false, bytes: 0 });
      continue;
    }
    const { bytes, rows, banner } = generateSeqBytes(decoded.text, titleFor(path.basename(file).replace(SCREEN_EXT, '')), maxRows);
    if (!bytes) {
      outcomes.push({ source: file, target, status: rows === 0 ? 'empty' : 'too-tall', rows, banner, bytes: 0 });
      continue;
    }
    if (!options.dryRun) {
      fs.writeFileSync(path.join(root, target), Buffer.from(bytes));
      manifest[target] = sha(bytes);
    }
    outcomes.push({ source: file, target, status: 'written', rows, banner, bytes: bytes.length });
  }
  if (!options.dryRun) {
    // A target this run no longer produces (its screen became machine-written,
    // or a pool took it over) leaves the manifest with it: the entry's only
    // job is to say "these bytes are still mine to replace".
    for (const target of Object.keys(manifest)) {
      if (!fs.existsSync(path.join(root, target))) delete manifest[target];
    }
    const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(ordered, null, 2) + '\n');
  }
  return outcomes;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outcomes = generateAll({
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
  });
  const count = (status: ScreenOutcome['status']) => outcomes.filter((o) => o.status === status).length;
  for (const o of outcomes.filter((x) => x.status !== 'exists')) {
    console.log(`${o.status.padEnd(9)} ${o.target} rows=${o.rows}${o.banner ? ' masthead' : ''}${o.bytes ? ` ${o.bytes}b` : ''}`);
  }
  console.log(
    `\nwritten=${count('written')} too-tall=${count('too-tall')} program=${count('program')} empty=${count('empty')} ` +
      `already-had-one=${count('exists')} edited-by-hand=${count('edited')}`
  );
}
