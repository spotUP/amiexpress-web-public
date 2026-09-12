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
      .map((r) => `--- page ${r.num}: ${r.title} ---\n${cleanPlain(r.content_plain)}`)
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

export type NewsBulletinOutcome = 'written' | 'kept' | 'unreachable';

function toCRLF(s: string): string {
  return s.replace(/\r?\n/g, '\r\n') + '\r\n';
}

/** BullHelp.txt names the number, once: re-ticks must not duplicate it. */
export function ensureBullHelpLine(bulletinsDir: string, num: number, title: string): void {
  const help = path.join(bulletinsDir, 'BullHelp.txt');
  let text = '';
  try {
    text = fs.readFileSync(help, 'latin1');
  } catch {
    text = '';
  }
  const re = new RegExp(`^#${num}\\b`, 'm');
  if (re.test(text)) return;
  if (text.length && !text.endsWith('\n')) text += '\n';
  fs.writeFileSync(help, `${text}#${num}    ${title}\n`, 'latin1');
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
    const text = toCRLF(
      `${src.title}\r\nUpdated ${deps.now().toISOString()}\r\n\r\n${body}\r\n\r\nSource: SVT Text via texttv.nu (unofficial mirror)`,
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, src.file), text, 'latin1');
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
