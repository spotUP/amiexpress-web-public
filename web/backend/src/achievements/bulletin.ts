/**
 * The achievements bulletin: two leaderboards, written to a file, shown at login.
 *
 * This is the Conftop-II shape and deliberately not a second bulletin
 * mechanism. Conftop draws a table and splices in whatever the sysop put in
 * `Conf<n>/Conftop.Header` / `.Tailer`; the file is read at display time and
 * the door owns only the table between them. Here the producer is the board
 * (it holds the achievements key, a door never does - S10) and the consumer
 * is the ordinary login screen ladder: `refreshAchievementsBulletin()` writes
 * `<board>/Screens/AchieveTop.txt`, and DISPLAY_ACHIEVE_BULL shows it with
 * `displayScreen('ACHIEVETOP', silent)` the same way BULL and NODE_BULL are
 * shown - a missing file is normal and says nothing on screen.
 *
 * Two columns, because the interesting comparison is GLOBAL against THIS
 * BOARD: the same handle in both columns is the point of the feature.
 *
 * A board with no achievements server configured must end with NO bulletin,
 * not a stale one: when the feature is off, or both leaderboards are empty,
 * the file is REMOVED. Nothing here throws and nothing here writes to a
 * caller's socket.
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { doorAchievementsApi } from './door-api';
import type { DoorAchievementsApi } from './door-api';
import type { LeaderboardRow } from './contract';

/** The screen name the login flow asks for; the file is `<name>.txt`. */
export const ACHIEVE_BULLETIN_SCREEN = 'AchieveTop';
/** Rows per column. Two headers, a rule and a tailer still leave a 24-line screen room. */
export const ACHIEVE_BULLETIN_ROWS = 15;
/** How often the board redraws it. A leaderboard does not move in seconds. */
export const ACHIEVE_BULLETIN_INTERVAL_MS = 15 * 60 * 1000;

const COLUMN_WIDTH = 38;   // rank 4 + ' ' + handle 20 + ' ' + points 7 + ' ' + awards 4
const GAP = ' ';
const WIDTH = COLUMN_WIDTH * 2 + GAP.length;  // 77, the width bull1.txt already uses

const ESC = '\x1b';
const TITLE_BAR = `${ESC}[4;33m`;
const TITLE_TEXT = `${ESC}[4;33;44m`;
const SCOPE = `${ESC}[36m`;
const HEAD = `${ESC}[35m`;
const RULE = `${ESC}[34m`;
const RANK = `${ESC}[33m`;
const OFF = `${ESC}[0m`;

/** Pad or clip to exactly `width`; a column that grows eats the one beside it. */
function fit(text: string, width: number): string {
  return text.length > width ? text.slice(0, width) : text.padEnd(width);
}

/** One leaderboard row as the 38 columns it owns, uncoloured. */
export function bulletinRow(row: LeaderboardRow | undefined): string {
  if (!row) return ' '.repeat(COLUMN_WIDTH);
  const rank = `${row.rank}.`.padStart(4);
  const handle = fit(row.handle, 20);
  const points = String(row.points).padStart(7);
  const awards = String(row.unlocks).padStart(4);
  return `${rank} ${handle} ${points} ${awards}`;
}

function columnHeader(): string {
  return `${'No#'.padEnd(4)} ${'Username (Handle)'.padEnd(20)} ${'Points'.padStart(7)} ${'Awds'.padStart(4)}`;
}

function columnRule(): string {
  return `${'='.repeat(4)}-${'='.repeat(20)}-${'='.repeat(7)}-${'='.repeat(4)}`;
}

/** The rank number carries the colour; the rest of the row stays plain, as bull1.txt does. */
function paintRow(plain: string): string {
  return `${RANK}${plain.slice(0, 4)}${OFF}${plain.slice(4)}`;
}

export interface BulletinArt {
  /** Sysop art spliced above the table, verbatim (the Conftop.Header slot). */
  header?: string;
  /** Sysop art spliced below the table, verbatim (the Conftop.Tailer slot). */
  tailer?: string;
}

/**
 * The bulletin, as bytes. Pure: no clock, no filesystem, no network.
 *
 * `boardName` is what the right-hand column is called, so a caller reads
 * "UPROUGH" rather than "this board" on the board's own screen.
 */
export function renderAchievementsBulletin(
  global: LeaderboardRow[],
  board: LeaderboardRow[],
  boardName: string,
  generatedAt: Date,
  art: BulletinArt = {}
): string {
  const out: string[] = [];
  if (art.header && art.header.length > 0) {
    out.push(art.header.replace(/\r?\n$/, ''));
  } else {
    const strap = fit('  ACHIEVEMENTS', WIDTH - 31) + 'Global and local leaderboards  ';
    /*
     * No form feed here any more.
     *
     * This used to open with '\x0c', expecting the terminal to clear on it the
     * way a real Amiga does (express.e:5224-5228 sendCLS sends ASCII 12).
     * xterm.js treats 0x0C as a LINE FEED, so it never cleared anything - the
     * leaderboard simply drew on top of whatever art was behind it.
     *
     * Writing `~f` instead would work, but only by turning MCI on for the
     * WHOLE file: express.e:6800-6806 enables MCI for a file when its first
     * line starts with `~`, and this file's body is generated - user names and
     * board names go into it, and a `~` in one would then be read as a code.
     * The clear belongs to whoever DISPLAYS the screen, so the display flow
     * does it (command.handler, DISPLAY_ACHIEVE_BULL) and this just writes art.
     */
    out.push(`${TITLE_BAR}${' '.repeat(WIDTH)}${OFF}`);
    out.push(`${TITLE_TEXT}${fit(strap, WIDTH)}${OFF}`);
    out.push('');
  }

  const left = fit(`GLOBAL, ALL TIME`, COLUMN_WIDTH);
  const right = fit(`${boardName.toUpperCase().slice(0, 26)}, ALL TIME`, COLUMN_WIDTH);
  out.push(`${SCOPE}${left}${GAP}${right}${OFF}`);
  out.push(`${HEAD}${columnHeader()}${GAP}${columnHeader()}${OFF}`);
  out.push(`${RULE}${columnRule()}${GAP}${columnRule()}${OFF}`);

  const emptyGlobal = global.length === 0;
  const emptyBoard = board.length === 0;
  // Only as tall as it has something to say. A fixed fifteen rows left a
  // field of blank lines under a board with one player on it.
  const height = Math.min(
    ACHIEVE_BULLETIN_ROWS,
    Math.max(1, global.length, board.length)
  );
  for (let i = 0; i < height; i++) {
    let l = bulletinRow(global[i]);
    let r = bulletinRow(board[i]);
    if (i === 0 && emptyGlobal) l = fit('     Nobody has scored yet.', COLUMN_WIDTH);
    if (i === 0 && emptyBoard) r = fit('     Nobody on this board yet.', COLUMN_WIDTH);
    const paintedL = i === 0 && emptyGlobal ? l : paintRow(l);
    const paintedR = i === 0 && emptyBoard ? r : paintRow(r);
    out.push(`${paintedL}${GAP}${paintedR}`);
  }

  out.push('');
  if (art.tailer && art.tailer.length > 0) {
    out.push(art.tailer.replace(/\r?\n$/, ''));
  } else {
    const stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');
    const foot = fit('  Type ACHIEVE for your own profile.', WIDTH - 30) + `Updated ${stamp} UTC`;
    out.push(`${RULE}${'-'.repeat(WIDTH)}${OFF}`);
    out.push(fit(foot, WIDTH));
  }
  return out.join('\r\n') + '\r\n';
}

/** Where the bulletin and its two art slots live. */
export function bulletinPaths(baseDir: string): { file: string; header: string; tailer: string } {
  const dir = path.join(baseDir, 'Screens');
  return {
    file: path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.txt`),
    header: path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.Header`),
    tailer: path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.Tailer`),
  };
}

function readArt(p: string): string | undefined {
  try {
    const text = fs.readFileSync(p, 'latin1');
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every copy of the bulletin a theme already holds.
 *
 * A theme created after the first bulletin was written got the file copied
 * into `Themes/<slug>/Board/`, and a theme copy WINS the global screen walk -
 * so the leaderboards froze at the moment the theme was made. Marking the
 * file generated stops the NEXT theme taking one; the copies already out
 * there have to be kept fresh, and this finds them.
 *
 * Only ones that EXIST are returned. Creating a copy in a theme that does not
 * want one would be the same shadowing bug from the other direction.
 */
export function themedBulletinCopies(baseDir: string): string[] {
  return themedBulletins(baseDir).map(t => t.file);
}

/**
 * Each theme's copy of the bulletin, and the art THAT theme frames it with.
 *
 * The board splices `Screens/AchieveTop.Header` above the leaderboards and
 * `.Tailer` below them. A theme is a set of screens a caller wears, so a theme
 * gets to draw its own pair - `Themes/<slug>/Board/AchieveTop.Header` - and
 * falls back to the board's where it has none, exactly as every other screen
 * in a theme does. Asked for on 2026-09-08: "start by making the achievement
 * bulletings editable".
 */
export function themedBulletins(baseDir: string): Array<{ slug: string; file: string; header: string; tailer: string }> {
  const themesDir = path.join(baseDir, 'Themes');
  let slugs: string[];
  try {
    slugs = fs.readdirSync(themesDir);
  } catch {
    return [];
  }
  const found: Array<{ slug: string; file: string; header: string; tailer: string }> = [];
  for (const slug of slugs) {
    const dir = path.join(themesDir, slug, 'Board');
    const copy = path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.txt`);
    try {
      if (!fs.statSync(copy).isFile()) continue;
    } catch {
      continue; // not this theme
    }
    found.push({
      slug,
      file: copy,
      header: path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.Header`),
      tailer: path.join(dir, `${ACHIEVE_BULLETIN_SCREEN}.Tailer`),
    });
  }
  return found;
}

function removeQuietly(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* never there, or already gone - both are the wanted end state */
  }
}

export type BulletinOutcome = 'written' | 'removed' | 'unreachable';

export interface BulletinDeps {
  api: DoorAchievementsApi;
  baseDir: () => string;
  boardName: () => string;
  now: () => Date;
  log: (line: string) => void;
}

export function defaultBulletinDeps(): BulletinDeps {
  return {
    api: doorAchievementsApi(),
    baseDir: () => config.getConfig().dataDir,
    boardName: () => config.getConfig().bbsName || 'THIS BOARD',
    now: () => new Date(),
    log: (line: string) => console.log(line),
  };
}

/**
 * Redraw the bulletin from the two leaderboards.
 *
 * - feature off             -> the file is removed, nothing is fetched
 * - server unreachable      -> the file is LEFT as it is (yesterday's board
 *                              beats a blank screen), outcome 'unreachable'
 * - both leaderboards empty -> the file is removed
 */
export async function refreshAchievementsBulletin(
  deps: BulletinDeps = defaultBulletinDeps()
): Promise<BulletinOutcome> {
  const paths = bulletinPaths(deps.baseDir());

  if (!deps.api.enabled()) {
    removeQuietly(paths.file);
    for (const copy of themedBulletinCopies(deps.baseDir())) removeQuietly(copy);
    return 'removed';
  }

  const [globalRes, boardRes] = await Promise.all([
    deps.api.leaderboard('global', 'all', ACHIEVE_BULLETIN_ROWS),
    deps.api.leaderboard('board', 'all', ACHIEVE_BULLETIN_ROWS),
  ]);

  if (!globalRes.body && !boardRes.body) {
    deps.log(`[WARN] achievements: bulletin not refreshed (${globalRes.error ?? globalRes.status})`);
    return 'unreachable';
  }

  const global = globalRes.body?.rows ?? [];
  const board = boardRes.body?.rows ?? [];
  if (global.length === 0 && board.length === 0) {
    removeQuietly(paths.file);
    for (const copy of themedBulletinCopies(deps.baseDir())) removeQuietly(copy);
    return 'removed';
  }

  const boardArt = { header: readArt(paths.header), tailer: readArt(paths.tailer) };
  const text = renderAchievementsBulletin(global, board, deps.boardName(), deps.now(), boardArt);
  fs.mkdirSync(path.dirname(paths.file), { recursive: true });
  fs.writeFileSync(paths.file, text, 'latin1');

  /*
   * EACH THEME GETS ITS OWN RENDER, not a copy of the board's.
   *
   * Writing the board's text into every theme meant a theme could hold the
   * file and never influence it: an artist could draw `AchieveTop.Header` in
   * their theme and callers wearing it would still see the board's furniture.
   * The leaderboard rows are the same everywhere - they are the board's facts
   * - and the art around them is the theme's.
   */
  for (const theme of themedBulletins(deps.baseDir())) {
    const themeHeader = readArt(theme.header) ?? boardArt.header;
    const themeTailer = readArt(theme.tailer) ?? boardArt.tailer;
    const themed = themeHeader === boardArt.header && themeTailer === boardArt.tailer
      ? text
      : renderAchievementsBulletin(global, board, deps.boardName(), deps.now(), {
        header: themeHeader,
        tailer: themeTailer,
      });
    try {
      fs.writeFileSync(theme.file, themed, 'latin1');
    } catch {
      /* one unwritable theme must not cost the board its bulletin */
    }
  }
  return 'written';
}

let running = false;

/**
 * Redraw now and every interval after. Unref'd, never overlapped - the
 * flusher's shape, for the same reason: this must not hold the process open
 * and must not stack on a slow server.
 */
export function startAchievementsBulletin(
  deps: BulletinDeps = defaultBulletinDeps(),
  intervalMs: number = ACHIEVE_BULLETIN_INTERVAL_MS
): NodeJS.Timeout {
  const tick = (): void => {
    if (running) return;
    running = true;
    refreshAchievementsBulletin(deps)
      .catch((err: Error) => deps.log(`[WARN] achievements: bulletin failed: ${err.message}`))
      .finally(() => { running = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

/** Test seam: the module-level overlap guard survives between suites otherwise. */
export function _resetBulletinRunningForTests(): void {
  running = false;
}
