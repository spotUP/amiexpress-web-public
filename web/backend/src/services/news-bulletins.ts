/**
 * WEB_NEWS_BULLETINS - SVT Text-TV headlines as board bulletins.
 *
 * WHIP task 8f358f41 ("Post news bulletins using our APIs"). Every hour a
 * tick fetches two Text-TV pages and writes them as root bulletins:
 * bull7.txt (news, page 100) and bull8.txt (sport, page 300). Both numbers
 * are free on the live volume (bull1-6 MultiTop/SamiLog-owned, bull9 in
 * use); anything else on disk is never touched.
 *
 * Shape copied from achievements/bulletin.ts: deps-injected refresh,
 * unref'd setInterval with an overlap guard, latin1 CRLF files, and a
 * failure leaves yesterday's file in place - stale news beats a blank
 * screen. The fetch lives here (not via handlers/sysop-ai/external):
 * services never import handlers; the 20 lines are the price of the
 * layering. texttv.nu is an unofficial SVT Text mirror and the footer
 * says so.
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

const TEXTTV = 'https://api.texttv.nu/api/get';
const TEXTTV_APP = 'amiexpress-web-bbs';
const FETCH_TIMEOUT_MS = 15000;

export const NEWS_BULLETIN_INTERVAL_MS = 3600 * 1000;

export interface NewsBulletinSource {
  /** Text-TV page or range. */
  page: string;
  /** Root Bulletins/ file. */
  file: string;
  /** Human title, also the BullHelp.txt entry. */
  title: string;
}

export const NEWS_BULLETIN_SOURCES: NewsBulletinSource[] = [
  { page: '100', file: 'bull7.txt', title: 'SVT Text news headlines' },
  { page: '300', file: 'bull8.txt', title: 'SVT Text sports headlines' },
];

export interface NewsBulletinDeps {
  baseDir: () => string;
  fetchPage: (page: string) => Promise<string | null>;
  now: () => Date;
  log: (line: string) => void;
}

async function fetchTextTvPage(page: string): Promise<string | null> {
  try {
    const rows: any[] = (
      await axios.get(`${TEXTTV}/${page}?app=${TEXTTV_APP}&includePlainTextContent=1`, {
        timeout: FETCH_TIMEOUT_MS,
        headers: { 'User-Agent': `${TEXTTV_APP}/1.0 (BBS news bulletins; https://bbs.uprough.net)`, Accept: 'application/json' },
      })
    ).data;
    if (!rows?.length) return null;
    return rows
      // The header is OURS, not SVT's, and at 56 characters it was the widest
      // line in the bulletin. Two short lines instead of one long one, so it
      // survives a forty-column screen without being folded mid-title.
      .map((r) => `--- page ${r.num} ---\n${r.title}\n${cleanPlain(r.content_plain)}`)
      .join('\n');
  } catch {
    return null;
  }
}

function cleanPlain(raw: unknown): string {
  return String(raw ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .join('\n')
    .slice(0, 3000);
}

export function defaultNewsBulletinDeps(): NewsBulletinDeps {
  return {
    baseDir: () => config.getConfig().dataDir,
    fetchPage: fetchTextTvPage,
    now: () => new Date(),
    log: (line: string) => console.log(line),
  };
}


/**
 * THE NARROWEST SCREEN THIS BOARD SERVES.
 *
 * "i needs to work in 40 and 80 columns" (sysop, 2026-09-14). A C64 caller
 * has forty, and a bulletin written for eighty is unreadable there - the
 * board folds what it is given, and a fold lands mid-word in the middle of a
 * headline.
 *
 * Forty is also what SVT Text IS: a teletext page is 40x24, so the content
 * arrives at this width already. What did NOT was this file's own furniture -
 * `--- page 100: Oppositionen i ledning med tre mandat ---` is 56 characters,
 * and the longest thing in the bulletin was always a line we wrote ourselves.
 *
 * Text that fits forty reads correctly at eighty. The reverse is not true,
 * which is why the narrow width is the one to write for.
 */
export const BULLETIN_COLUMNS = 40;

/**
 * Fold one line onto `width`, breaking between words.
 *
 * A word longer than the width is cut rather than left to overflow - a URL or
 * a run of box-drawing has no break in it, and a line that overflows is the
 * thing being fixed. Leading whitespace is preserved on the first row only:
 * teletext centres its headlines with spaces, and repeating that indent on
 * every continuation row would centre nothing and waste the width.
 */
export function foldLine(line: string, width = BULLETIN_COLUMNS): string[] {
  if (line.length <= width) return [line];
  const indent = line.slice(0, line.length - line.trimStart().length);
  const words = line.trimStart().split(/ +/);
  const rows: string[] = [];
  let row = indent;
  const room = () => width - row.length;

  for (let word of words) {
    while (word.length > width) {
      if (row.trim().length > 0) { rows.push(row.trimEnd()); row = ''; }
      rows.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (word.length === 0) continue;
    const needsSpace = row.trim().length > 0;
    if (word.length + (needsSpace ? 1 : 0) > room()) {
      rows.push(row.trimEnd());
      row = word;
    } else {
      row += (needsSpace ? ' ' : '') + word;
    }
  }
  if (row.trim().length > 0 || rows.length === 0) rows.push(row.trimEnd());
  return rows;
}

/** Every line of a bulletin, folded to the narrowest screen the board serves. */
export function foldBulletin(text: string, width = BULLETIN_COLUMNS): string {
  return text
    .split(/\r?\n/)
    .flatMap(line => foldLine(line, width))
    .join('\n');
}

export type NewsBulletinOutcome = 'written' | 'kept' | 'unreachable';

function toCRLF(s: string): string {
  return s.replace(/\r?\n/g, '\r\n') + '\r\n';
}

/**
 * BullHelp.txt names the number, once: re-ticks must not duplicate it.
 *
 * ONLY A MISSING FILE IS AN EMPTY ONE. This read used to swallow every error
 * and carry on with `text = ''`, which then WROTE that empty string back with
 * one line appended - so a file the board could not read for a moment (a
 * locked file, a busy disk, too many open handles) came back with every other
 * bulletin's line gone. The board lists its own bulletins from this file, and
 * this runs on a timer: a transient read error was quiet, permanent content
 * loss. Anything but ENOENT now leaves the file alone.
 */
export function ensureBullHelpLine(
  bulletinsDir: string,
  num: number,
  title: string,
  // The read, as a seam. The destructive case is a read that fails while the
  // write would have succeeded - a locked file, a busy disk, too many open
  // handles - and no chmod expresses that, because permissions stop both.
  // `import * as fs` compiles to a COPIED namespace here, so a spy on the
  // test's own fs never reaches this call either.
  readText: (file: string) => string = (file) => fs.readFileSync(file, 'latin1'),
): void {
  const help = path.join(bulletinsDir, 'BullHelp.txt');
  let text = '';
  try {
    text = readText(help);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    text = '';
  }
  const re = new RegExp(`^#${num}\\b`, 'm');
  if (re.test(text)) return;
  if (text.length && !text.endsWith('\n')) text += '\n';
  writeFileAtomic(help, `${text}#${num}    ${title}\n`);
}

/**
 * WRITE ALL OF IT, OR NONE OF IT.
 *
 * These files are written straight onto the live board on a timer, and a
 * process that dies mid-write leaves a bulletin truncated - a zero-byte
 * bull7.txt is a known sighting on this board, and "0 bytes is a kill
 * mid-write" is how it was explained. A caller then opens an empty bulletin
 * until the next tick, and BullHelp.txt losing its listing is worse.
 *
 * The temp file sits in the same directory so the rename cannot cross a
 * filesystem, and rename is atomic: readers see the old file or the new one.
 */
function writeFileAtomic(target: string, contents: string): void {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, contents, 'latin1');
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* the write is what failed; the target is untouched */ }
    throw err;
  }
}

export async function refreshNewsBulletins(
  deps: NewsBulletinDeps = defaultNewsBulletinDeps(),
): Promise<NewsBulletinOutcome> {
  const dir = path.join(deps.baseDir(), 'Bulletins');
  let written = false;
  let kept = false;
  for (const src of NEWS_BULLETIN_SOURCES) {
    const num = parseInt(src.file.replace(/\D/g, ''), 10);
    let body: string | null = null;
    try {
      body = await deps.fetchPage(src.page);
    } catch (err) {
      deps.log(`[WARN] news-bulletins: ${src.file} fetch failed (${(err as Error).message})`);
    }
    if (!body) {
      kept = true;
      continue;
    }
    // Folded to forty BEFORE the CRLF pass: a C64 caller has forty columns,
    // and text that fits forty reads correctly at eighty.
    const text = toCRLF(
      foldBulletin(
        `${src.title}\nUpdated ${deps.now().toISOString()}\n\n${body}\n\nSource: SVT Text via texttv.nu (unofficial mirror)`,
      ),
    );
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, src.file), text);
    if (Number.isFinite(num)) {
      try {
        ensureBullHelpLine(dir, num, src.title);
      } catch (err) {
        deps.log(`[WARN] news-bulletins: BullHelp.txt not updated (${(err as Error).message})`);
      }
    }
    written = true;
  }
  if (written) return 'written';
  if (kept) return 'kept';
  return 'unreachable';
}

let running = false;

/**
 * Fetch now and every interval after. Unref'd, never overlapped - the
 * achievements bulletin's shape, for the same reason.
 */
export function startNewsBulletins(
  deps: NewsBulletinDeps = defaultNewsBulletinDeps(),
  intervalMs: number = NEWS_BULLETIN_INTERVAL_MS,
): NodeJS.Timeout {
  const tick = (): void => {
    if (running) return;
    running = true;
    refreshNewsBulletins(deps)
      .catch((err: Error) => deps.log(`[WARN] news-bulletins: refresh failed: ${err.message}`))
      .finally(() => { running = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}
