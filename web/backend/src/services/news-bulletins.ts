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
import { parseString } from 'xml2js';
import { renderedRows, GENERATED_SCREEN_ROWS } from '../screens/screen-rows';
import { config } from '../config';

const TEXTTV = 'https://api.texttv.nu/api/get';
const TEXTTV_APP = 'amiexpress-web-bbs';
const FETCH_TIMEOUT_MS = 15000;

export const NEWS_BULLETIN_INTERVAL_MS = 3600 * 1000;

/**
 * Where a page's content comes from.
 *
 * - `teletext` - SVT Text-TV, the original two pages. Unchanged.
 * - `rss`      - RSS 2.0 or Atom. The underground magazine.
 * - `json`     - a bare JSON endpoint (Pouet, Hacker News).
 */
export type NewsSourceKind = 'teletext' | 'rss' | 'json';

/** One column of a `json` source's row, as a dotted path into the item. */
export interface NewsBulletField {
  label: string;
  path: string;
}

export interface NewsBulletinSource {
  kind: NewsSourceKind;
  /** Text-TV page or range (`teletext` only). */
  page?: string;
  /** Feed URL (`rss` / `json` only). */
  url?: string;
  /** Root Bulletins/ file. */
  file: string;
  /** Human title, also the BullHelp.txt entry. */
  title: string;
  /** The `Source:` attribution. Per source - the magazine's pages are not all SVT. */
  source: string;
  /** How often this page refreshes. Default: the global interval. */
  intervalMs?: number;
  /** Minimum gap between two hits on this source's HOST. See the host gate. */
  hostGapMs?: number;
  /** How many items to render. Default 12 - one screen's worth. */
  limit?: number;
  /** `json`: dotted path to the item array. */
  listPath?: string;
  /** `json`: which fields, in render order. */
  fields?: NewsBulletField[];
}

const MINUTE = 60 * 1000;

/**
 * The board's own numbers. MultiTop owns 1-6, the Requests door owns 9, the
 * checker door writes 11, and 7/8 are SVT. A source aimed at one of these is a
 * bug, not a conflict to resolve at runtime, so it is refused at the door.
 */
export const OWNED_BULLETIN_NUMBERS = new Set([1, 2, 3, 4, 5, 6, 9, 11]);

export const NEWS_BULLETIN_SOURCES: NewsBulletinSource[] = [
  { kind: 'teletext', page: '100', file: 'bull7.txt', title: 'SVT Text news headlines', source: 'SVT Text via texttv.nu (unofficial mirror)' },
  { kind: 'teletext', page: '300', file: 'bull8.txt', title: 'SVT Text sports headlines', source: 'SVT Text via texttv.nu (unofficial mirror)' },

  // --- the magazine. 13 upward: Bulls.CFG reserves 13-20, the files do not exist.
  { kind: 'rss', url: 'https://0x00sec.org/feed', file: 'bull13.txt', title: '0x00SEC - reversing and exploit research', source: '0x00sec.org', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://crackmes.one/rss', file: 'bull14.txt', title: 'Crackmes - new challenges to reverse', source: 'crackmes.one', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://gitlab.com/exploit-database/exploitdb/-/commits/main.atom', file: 'bull15.txt', title: 'Exploit-DB - fresh public exploits', source: 'Exploit Database (OffSec)', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://www.openwall.com/lists/oss-security/', file: 'bull16.txt', title: 'oss-security - the open wall', source: 'Openwall oss-security (no feed; index scrape)', hostGapMs: 15000 },
  { kind: 'rss', url: 'https://packetstormsecurity.com/feeds/files/latest.xml', file: 'bull17.txt', title: 'Packet Storm - exploits and advisories', source: 'Packet Storm Security', hostGapMs: 10000 },

  { kind: 'rss', url: 'https://feeds.feedburner.com/TheHackersNews', file: 'bull18.txt', title: 'The Hacker News', source: 'thehackernews.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://www.bleepingcomputer.com/feed/', file: 'bull19.txt', title: 'BleepingComputer', source: 'bleepingcomputer.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://krebsonsecurity.com/feed/', file: 'bull20.txt', title: 'Krebs on Security', source: 'krebsonsecurity.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://www.schneier.com/feed/atom/', file: 'bull21.txt', title: 'Schneier on Security', source: 'schneier.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://googleprojectzero.blogspot.com/feeds/posts/default', file: 'bull22.txt', title: 'Project Zero - deep bug research', source: 'Google Project Zero', hostGapMs: 5000, intervalMs: 6 * 60 * MINUTE },
  { kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index', file: 'bull23.txt', title: 'Ars Technica', source: 'arstechnica.com', hostGapMs: 5000 },
  { kind: 'json', url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20', file: 'bull24.txt', title: 'Hacker News - newest stories', source: 'news.ycombinator.com via Algolia', hostGapMs: 5000, intervalMs: 5 * MINUTE, listPath: 'hits', fields: [{ label: '', path: 'title' }, { label: 'points', path: 'points' }] },

  { kind: 'rss', url: 'https://rtl-sdr.com/feed/', file: 'bull25.txt', title: 'RTL-SDR - decoding closed signals', source: 'rtl-sdr.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://hackaday.com/tag/phreaking/feed/', file: 'bull26.txt', title: 'Hackaday - phreaking and comms', source: 'hackaday.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://hackaday.com/feed/', file: 'bull27.txt', title: 'Hackaday - hardware hacking', source: 'hackaday.com', hostGapMs: 5000 },

  { kind: 'rss', url: 'https://news.scene.org/feeds/rss/', file: 'bull28.txt', title: 'The Scene - demoscene news', source: 'news.scene.org', hostGapMs: 5000 },
  { kind: 'json', url: 'https://api.pouet.net/v1/prod/?random=true', file: 'bull29.txt', title: 'Pouet - Amiga scene productions', source: 'pouet.net', hostGapMs: 5000, listPath: 'prod', fields: [{ label: '', path: 'name' }, { label: '', path: 'type' }] },

  { kind: 'rss', url: 'https://rave-archive.com/feed/', file: 'bull31.txt', title: 'Rave Archive UK - pirate radio and jungle', source: 'rave-archive.com', hostGapMs: 5000 },
  { kind: 'rss', url: 'https://acidtechno.co.uk/feed', file: 'bull32.txt', title: 'Acid Techno', source: 'acidtechno.co.uk', hostGapMs: 5000 },

  { kind: 'rss', url: 'https://www.reddit.com/r/Amiga/.rss', file: 'bull33.txt', title: 'r/Amiga', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/reverseengineering/.rss', file: 'bull34.txt', title: 'r/reverseengineering', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/demoscene/.rss', file: 'bull35.txt', title: 'r/demoscene', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/phreaking/.rss', file: 'bull36.txt', title: 'r/phreaking', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/sdr/.rss', file: 'bull37.txt', title: 'r/SDR - software defined radio', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/radionerds/.rss', file: 'bull38.txt', title: 'r/radionerds', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/pirateradio/.rss', file: 'bull39.txt', title: 'r/PirateRadio', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/ansi/.rss', file: 'bull40.txt', title: 'r/ANSI - text art', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/modmusic/.rss', file: 'bull41.txt', title: 'r/modmusic - tracker files', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/synthdiy/.rss', file: 'bull42.txt', title: 'r/synthdiy - build your own synths', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/freetekno/.rss', file: 'bull43.txt', title: 'r/freetekno - free parties and sound systems', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },
  { kind: 'rss', url: 'https://www.reddit.com/r/urbanexploration/.rss', file: 'bull44.txt', title: 'r/urbanexploration - urbex', source: 'reddit.com', hostGapMs: 12000, intervalMs: 30 * MINUTE },

  { kind: 'rss', url: 'https://www.textfiles.com/blog.xml', file: 'bull45.txt', title: 'Jason Scott - preserving old text', source: 'textfiles.com', hostGapMs: 15000, intervalMs: 6 * 60 * MINUTE },
  { kind: 'rss', url: 'https://phrack.org/feed/', file: 'bull46.txt', title: 'Phrack - the hacker magazine', source: 'phrack.org', hostGapMs: 15000, intervalMs: 6 * 60 * MINUTE },
  { kind: 'rss', url: 'https://www.kelacyber.com/feed/rss', file: 'bull47.txt', title: 'KELA - cybercrime research', source: 'kelacyber.com', hostGapMs: 10000 },
  { kind: 'rss', url: 'https://spycloud.com/blog/feed/', file: 'bull48.txt', title: 'SpyCloud - cybercrime insights', source: 'spycloud.com', hostGapMs: 10000 },
  { kind: 'rss', url: 'https://socradar.io/blog/rss', file: 'bull49.txt', title: 'SOCRadar - threat intelligence', source: 'socradar.io', hostGapMs: 10000 },
];

export interface NewsBulletinDeps {
  baseDir: () => string;
  fetchPage: (page: string) => Promise<string | null>;
  /**
   * `rss` / `json` sources. Optional so a test - or the teletext-only path -
   * can run without it; a source with no fetcher is `kept`, never a throw.
   */
  fetchUrl?: (url: string, opts: FeedFetchOptions) => Promise<FeedFetchResult>;
  now: () => Date;
  log: (line: string) => void;
}

export interface FeedFetchOptions {
  hostGapMs?: number;
  etag?: string;
  lastModified?: string;
}

export interface FeedFetchResult {
  body: string | null;
  notModified?: boolean;
  etag?: string;
  lastModified?: string;
  /**
   * Why there is no body. Carried rather than logged inside the fetcher so the
   * caller's log can NAME the source - a source that fails every tick used to
   * be indistinguishable from one with nothing new, which is the one thing a
   * bulletin board must never be ambiguous about.
   */
  error?: string;
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
      //
      // The BODY is SVT's own page where the markup allows - colour and the
      // real 40-column grid - and the plain text when it does not, so a change
      // at texttv.nu costs the board its colour rather than its news.
      .map((r) => {
        const markup = Array.isArray(r.content) ? r.content[0] : r.content;
        const coloured = typeof markup === 'string' ? teletextToAnsi(markup) : null;
        return `--- page ${r.num} ---\n${r.title}\n${coloured ?? cleanPlain(r.content_plain)}`;
      })
      .join('\n');
  } catch {
    return null;
  }
}


/**
 * SVT Text's own colours, as ANSI.
 *
 * "some text-tv coloring would be nice" and "the centering is a bit weird"
 * (sysop, 2026-09-14) - and both come from the same place. The API's
 * `content_plain` throws away the colour AND the spacing; its `content` field
 * is the page as teletext draws it, 40 columns wide, with a span per run and
 * a class per colour:
 *
 *   <span class="line"><span class="bgBl Y">100 </span>...</span>
 *
 * Reading that instead gives authentic colour and the REAL teletext grid, so
 * the centring stops being our approximation of SVT's and becomes SVT's.
 *
 * Teletext has eight full-saturation colours and no dim ones, so each maps to
 * the bright ANSI pen (`1;3x`) rather than the dim one - the same choice the
 * board's own teletext mode makes (`XTERM_CONFIG.teletextTheme`).
 */
const TELETEXT_FG: Record<string, string> = {
  Bl: '30', R: '1;31', G: '1;32', Y: '1;33', B: '1;34', M: '1;35', C: '1;36', W: '1;37',
};

const TELETEXT_BG: Record<string, string> = {
  bgBl: '40', bgR: '41', bgG: '42', bgY: '43', bgB: '44', bgM: '45', bgC: '46', bgW: '47',
};

/** `&amp;` and friends, which the API sends and a terminal does not read. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * One teletext page as coloured, 40-column ANSI.
 *
 * Returns null when the markup is not what this expects - a page with no
 * `line` spans is a shape nobody has seen, and guessing at it would put
 * garbage on the board. The caller keeps the plain text in that case.
 */
export function teletextToAnsi(html: string): string | null {
  /*
   * SPLIT on the row boundary rather than matching across it. A row's content
   * is nested spans, so a regex that tried to find each row's own closing tag
   * merged rows together.
   *
   * And the boundary is "a span whose CLASS LIST contains `line`", not the
   * literal `<span class="line`: SVT writes a double-height headline as
   * `<span style="...scaleY(2)..." class="line DH">`, with the style first.
   * Matching the literal missed every one of those and folded each into the
   * row above it - three 80-column lines in a 40-column page, which is
   * exactly the "centering is a bit weird" the sysop reported.
   */
  const chunks = html.split(/<span (?=[^>]*class="[^"]*\bline\b)/).slice(1);
  if (chunks.length === 0) return null;

  const rows = chunks.map(chunk => {
    // Past this row's own opening tag, whatever attributes it carries.
    const inner = chunk.replace(/^[^>]*>/, '');
    let row = '';
    let pen = '';
    for (const m of inner.matchAll(/<span class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/g)) {
      const classes = m[1].split(/\s+/);
      const fg = classes.map(c => TELETEXT_FG[c]).find(Boolean);
      const bg = classes.map(c => TELETEXT_BG[c]).find(Boolean);
      /*
       * A `bgImg` span is a teletext MOSAIC - a 2x3 block served as a gif.
       * The shape is in the image and cannot be recovered from the markup, so
       * it becomes a space wearing the background colour: the banner keeps
       * its colour and its width, which is what survives of it on a terminal.
       */
      const text = classes.includes('bgImg')
        ? ' '.repeat(Math.max(1, decodeEntities(m[2].replace(/<[^>]*>/g, '')).length))
        : decodeEntities(m[2].replace(/<[^>]*>/g, ''));
      if (text.length === 0) continue;

      const want = `${bg ? `\x1b[${bg}m` : ''}${fg ? `\x1b[${fg}m` : ''}`;
      if (want !== pen) { row += want; pen = want; }
      row += text;
    }
    // Every row closes its own colours: a bulletin is included INTO another
    // screen, and a pen left on would paint whatever the board draws next.
    return row.length > 0 ? `${row}\x1b[0m` : '';
  });

  return rows.join('\n');
}

function cleanPlain(raw: unknown): string {
  return String(raw ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .join('\n')
    .slice(0, 3000);
}

/**
 * TO ASCII, ONCE, AT GENERATION TIME.
 *
 * The board's own bulletin proved the problem: `bull7.txt` read
 * `p?verkas` where SVT's page says `paverkas`. The file is written latin1 and a
 * C64 caller has no glyph for `a-ring` at all, so the character was lost on the
 * way to whoever was reading - silently, and only on one of the two paths.
 *
 * Transliterating here fixes both paths at once and makes the loss visible in
 * the source instead of in the caller's terminal. Nordic, Polish, Czech and
 * German get the forms a reader would actually recognise (`ae`, `oe`, `ss`); the
 * rest fold to the base letter. Anything left over goes through NFD so an
 * accent it has no table entry for still arrives as its letter.
 */
const TRANSLITERATE: Record<string, string> = {
  // Nordic: ring/a-ring/o-ring get the forms a reader would recognise.
  '\u00e5': 'a', '\u00e4': 'ae', '\u00f6': 'oe',
  '\u00c5': 'A', '\u00c4': 'Ae', '\u00d6': 'Oe',
  '\u00df': 'ss', '\u00e6': 'ae', '\u00c6': 'Ae', '\u0153': 'oe', '\u0152': 'Oe',
  // Polish. `s` with an acute is a DIGRAPH, not a plain s - the board gets
  // Polish feeds, and "szodl" is what a Polish reader expects to read.
  '\u0142': 'l', '\u0141': 'L', '\u0119': 'e', '\u0118': 'E', '\u0105': 'a', '\u0104': 'A',
  '\u017c': 'z', '\u017b': 'Z', '\u017a': 'z', '\u0179': 'Z',
  '\u015b': 'sz', '\u015a': 'Sz',
  '\u0107': 'c', '\u0106': 'C', '\u0144': 'n', '\u0143': 'N', '\u0111': 'd', '\u0110': 'D',
  // Czech.
  '\u010d': 'c', '\u010c': 'C', '\u0161': 's', '\u0160': 'S', '\u017e': 'z', '\u017d': 'Z',
  '\u0159': 'r', '\u0158': 'R', '\u011b': 'e', '\u011a': 'E', '\u016f': 'u', '\u016e': 'U',
  '\u010f': 'c', '\u010e': 'C', '\u0148': 'n', '\u0147': 'N', '\u0165': 't', '\u0164': 'T',
  // The Latin-1 letters a news feed actually carries. The Nordic ae/oe/ss
  // forms above are authoritative, so they are not repeated here.
  '\u00e1': 'a', '\u00e0': 'a', '\u00e2': 'a', '\u00e3': 'a',
  '\u00e8': 'e', '\u00e9': 'e', '\u00ea': 'e', '\u00eb': 'e',
  '\u00ec': 'i', '\u00ed': 'i', '\u00ee': 'i', '\u00ef': 'i',
  '\u00f2': 'o', '\u00f3': 'o', '\u00f4': 'o', '\u00f5': 'o', '\u00f8': 'o',
  '\u00f9': 'u', '\u00fa': 'u', '\u00fb': 'u', '\u00fc': 'ue',
  '\u00f1': 'n', '\u00e7': 'c',
  '\u00c1': 'A', '\u00c0': 'A', '\u00c2': 'A', '\u00c3': 'A',
  '\u00c8': 'E', '\u00c9': 'E', '\u00ca': 'E', '\u00cb': 'E',
  '\u00cc': 'I', '\u00cd': 'I', '\u00ce': 'I', '\u00cf': 'I',
  '\u00d2': 'O', '\u00d3': 'O', '\u00d4': 'O', '\u00d5': 'O', '\u00d8': 'O',
  '\u00d9': 'U', '\u00da': 'U', '\u00db': 'U', '\u00dc': 'Ue',
  '\u00d1': 'N', '\u00c7': 'C',
  // Fractions and the typographic characters feeds use for quotes and dashes.
  '\u00bd': '1/2', '\u00bc': '1/4', '\u00be': '3/4', '\u00a0': ' ',
  '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '*', '\u00b7': '*',
  '\u00ab': '<', '\u00bb': '>', '\u00b0': ' deg', '\u00a9': '(c)', '\u00ae': '(r)',
  '\u20ac': 'EUR', '\u00a3': 'GBP', '\u00a5': 'JPY', '\u00b1': '+/-', '\u00d7': 'x', '\u00f7': '/',
};

/** Strip markup, decode entities, transliterate, collapse whitespace. */
export function toBulletinText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Markdown a feed left in a headline: backticks and asterisks read as
    // punctuation noise on a 40-column screen. Underscore is NOT stripped -
    // §6 says preserve release identifiers, and half of them contain one
    // (x86_64, snake_case handles, CVSS vectors).
    .replace(/[`*]{1,3}/g, '')
    .split('')
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join('')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => TRANSLITERATE[String.fromCharCode(Number(n))] ?? '')
    .replace(/&amp;/g, '&')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[^\x20-\x7e\n\t]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** The raw value at a dotted path. Objects come back as objects. */
function valueAt(obj: any, dotted: string): any {
  return dotted.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), obj);
}

/**
 * A value as it reads on a page.
 *
 * A feed item's `link` is `<link>https://...</link>`, and Atom's `author` is a
 * nested object; both have to become something a column can hold. Anything else
 * is its own text.
 */
function labelOf(value: any): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const first = Array.isArray(value) ? value[0] : value;
    return String(first?.name ?? first?.title ?? first?.value ?? first?.href ?? '');
  }
  return String(value);
}

/** One field of an item, as a row of text. */
function pick(obj: any, dotted: string): string {
  return toBulletinText(labelOf(valueAt(obj, dotted)));
}

/**
 * RSS 2.0 and Atom into the same flat text `fitNewsBulletin` already trims.
 *
 * `<rss><channel><item>` and `<feed><entry>` differ only in where the items sit
 * and what the text field is called (`description` vs `summary`), so both shapes
 * come out of one function rather than two that drift.
 */
export interface FeedItem {
  headline: string;
  summary: string;
  source: string;
  url?: string;
}

export async function parseFeedItems(
  xml: string,
  source: string,
  limit = 12,
): Promise<{ text: string; items: FeedItem[] }> {
  const parsed: any = await new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err: Error | null, res: any) =>
      err ? reject(err) : resolve(res),
    );
  });
  const rssItems = asArray(parsed?.rss?.channel?.item);
  const atomEntries = asArray(parsed?.feed?.entry);
  const rows = rssItems.length ? rssItems : atomEntries;
  const items: FeedItem[] = [];
  for (const it of rows.slice(0, limit)) {
    const headline = pick(it, 'title');
    const summary = pick(it, 'description') || pick(it, 'summary') || pick(it, 'content');
    if (!headline && !summary) continue;
    items.push({ headline, summary, source, url: pick(it, 'link') || undefined });
  }
  const text = items
    .map((i) => (i.summary ? `${i.headline}\n   ${i.summary}` : i.headline))
    .filter(Boolean)
    .join('\n');
  return { text, items };
}

export async function parseFeed(xml: string, limit = 12): Promise<string> {
  return (await parseFeedItems(xml, '', limit)).text;
}

/** A JSON endpoint, shaped by the source's `listPath` and `fields`. */
/** A JSON endpoint's rows, shaped by the source's `listPath` and `fields`. */
export function jsonItems(raw: string, src: NewsBulletinSource, limit = 12): FeedItem[] {
  const data = JSON.parse(raw);
  const found = src.listPath ? valueAt(data, src.listPath) : data;
  const list: any[] = Array.isArray(found) ? found : found ? [found] : [];
  const fields = src.fields ?? [{ label: '', path: 'title' }];
  return list
    .slice(0, limit)
    .map((item: any) => {
      const parts = fields.map((f) => pick(item, f.path)).filter(Boolean);
      const headline = fields[0]?.path ? pick(item, fields[0].path) : '';
      return {
        headline,
        summary: parts.filter((p) => p !== headline).join('  '),
        source: src.source,
      };
    })
    .filter((i) => i.headline);
}

/**
 * A JSON endpoint as bulletin text: one row per item.
 *
 * `fields` describes ONE row - the headline and the things worth printing
 * beside it - so unlike RSS there is no indented second line. That is the
 * whole reason the JSON sources declare `fields` at all.
 */
export function parseJsonFeed(raw: string, src: NewsBulletinSource, limit = 12): string {
  const data = JSON.parse(raw);
  const found = src.listPath ? valueAt(data, src.listPath) : data;
  const list: any[] = Array.isArray(found) ? found : found ? [found] : [];
  const fields = src.fields ?? [{ label: '', path: 'title' }];
  return list
    .slice(0, limit)
    .map((item: any) =>
      fields
        .map((f) => {
          const v = pick(item, f.path);
          if (!v) return '';
          return f.label ? `${f.label} ${v}` : v;
        })
        .filter(Boolean)
        .join('  '),
    )
    .filter(Boolean)
    .join('\n');
}

export function defaultNewsBulletinDeps(): NewsBulletinDeps {
  return {
    baseDir: () => config.getConfig().dataDir,
    fetchPage: fetchTextTvPage,
    fetchUrl: fetchFeedUrl,
    now: () => new Date(),
    log: (line: string) => console.log(line),
  };
}

/**
 * THE HOST GATE.
 *
 * Measured, not assumed: nine Reddit feeds hit at eight-second spacing
 * returned one 200 and eight 429s. Reddit throttles per-IP-per-HOST, not per
 * subreddit, so a board that pulls ten of its pages from one host on a timer
 * locks ITSELF out of all ten - and the lock is by IP, which on this board is
 * the whole board.
 *
 * A host's next-legal-request time, kept in memory for the life of the process.
 * On an hourly tick the cost is bounded (four Reddit pages at twelve seconds is
 * under a minute) and a shorter interval stays correct instead of abusive.
 */
const hostGate = new Map<string, number>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Deliberately NOT unref'd, unlike the interval timer in startNewsBulletins.
 *
 * This one is being AWAITED. An unref'd timer does not hold the event loop
 * open, so a process that is otherwise idle - a one-shot run, a test, a CLI -
 * exits while the gate is sleeping and the rest of the tick never happens. The
 * recurring timer is the one that must not keep the process alive.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** Wait until this host's gap has elapsed, then claim the next slot. */
async function passHostGate(url: string, gapMs: number): Promise<void> {
  if (!(gapMs > 0)) return;
  const host = hostOf(url);
  const now = Date.now();
  const legalAt = hostGate.get(host) ?? 0;
  if (now < legalAt) await sleep(legalAt - now);
  hostGate.set(host, Date.now() + gapMs);
}

async function fetchFeedUrl(url: string, opts: FeedFetchOptions): Promise<FeedFetchResult> {
  await passHostGate(url, opts.hostGapMs ?? 1000);
  try {
    const headers: Record<string, string> = {
      'User-Agent': `${TEXTTV_APP}/1.0 (BBS news bulletins; https://bbs.uprough.net)`,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*',
    };
    if (opts.etag) headers['If-None-Match'] = opts.etag;
    if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;
    const res = await axios.get(url, { timeout: FETCH_TIMEOUT_MS, responseType: 'text', transformResponse: [(d) => d], headers });
    if (res.status === 304) return { body: null, notModified: true, etag: opts.etag, lastModified: opts.lastModified };
    return {
      body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      etag: res.headers?.etag,
      lastModified: res.headers?.['last-modified'],
    };
  } catch (err: any) {
    // 304 can arrive as a thrown axios error on some versions; treat it as not-modified.
    if (err?.response?.status === 304) return { body: null, notModified: true };
    return { body: null, error: err?.message ?? String(err) };
  }
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
 * How tall a news bulletin may be. The board's one budget for a generated
 * screen - see screens/screen-rows, which explains why it is measured against
 * a 24-row terminal rather than a 25-row one.
 */
export const BULLETIN_ROWS = GENERATED_SCREEN_ROWS;

/**
 * Fold one line onto `width`, breaking between words.
 *
 * A word longer than the width is cut rather than left to overflow - a URL or
 * a run of box-drawing has no break in it, and a line that overflows is the
 * thing being fixed. Leading whitespace is preserved on the first row only:
 * teletext centres its headlines with spaces, and repeating that indent on
 * every continuation row would centre nothing and waste the width.
 */
/** What a caller SEES: the line with its colour codes taken out. */
function visibleLength(line: string): number {
  return line.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function foldLine(line: string, width = BULLETIN_COLUMNS): string[] {
  /*
   * A COLOUR CODE IS NOT A COLUMN. `ESC[1;33m` is five invisible characters,
   * and counting them folded SVT's coloured rows - which are exactly forty
   * columns wide - as though they were sixty. A teletext row that already
   * fits is left alone whatever it carries.
   */
  if (visibleLength(line) <= width) return [line];
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

/**
 * A news bulletin, trimmed to a screen.
 *
 * An SVT teletext page is 32 rows, which is what these came out at - so the
 * board paginated its own news, putting `(Pause)...More(y/n/ns)?` through the
 * headlines. A bulletin is one composed screen; it should not need a page
 * break, and a caller who wants the whole page has the Text-TV door.
 *
 * HEADLINES GO FROM THE BOTTOM, and the frame never does. The first two lines
 * say what this is and how old it is, and the Source line is an attribution -
 * dropping any of those to save a row would be the wrong trade. What gives is
 * the tail of the list, which is the least recent news on the page.
 *
 * A budget it cannot meet leaves the bulletin alone rather than reducing it to
 * a title and a credit: too tall and readable beats fitted and empty, and it
 * is the sysop's cue that the budget is wrong for this page.
 */
export function fitNewsBulletin(text: string, rows: number): string {
  if (rows <= 0 || renderedRows(text) <= rows) return text;

  const lines = text.split('\n');
  const trailingBreak = text.endsWith('\n');
  if (trailingBreak) lines.pop();

  // The frame: the title and its Updated line at the top, and from the blank
  // line before `Source:` to the end at the bottom.
  const head = lines.slice(0, 2);
  const sourceAt = lines.findIndex((line) => line.startsWith('Source:'));
  const tail = sourceAt >= 0 ? lines.slice(Math.max(2, sourceAt - 1)) : [];
  const body = lines.slice(head.length, sourceAt >= 0 ? Math.max(2, sourceAt - 1) : lines.length);

  const room = rows - head.length - tail.length;
  // Nothing left for news: hand back what we were given.
  if (room < 1) return text;

  const kept = body.slice(0, room);
  // A trimmed list should not end on a blank line left behind by the cut.
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();

  return [...head, ...kept, ...tail].join('\n') + (trailingBreak ? '\n' : '');
}

/**
 * Per-source refresh bookkeeping: when each page last ran, and the validators
 * that let the next run skip the download entirely.
 *
 * In memory on purpose. A validator surviving a restart would mean the board
 * asked for a conditional GET with a stale ETag and got a 200 it did not need -
 * harmless - while persisting it would mean a state file to keep consistent
 * with seventeen bulletins. The cost of forgetting is one full fetch.
 */
const lastRun = new Map<string, number>();
const validators = new Map<string, { etag?: string; lastModified?: string }>();

/**
 * Whether a source is due. Pure: the caller passes when it last ran.
 *
 * The first run of a source is always due, however long its interval is - a
 * board that starts with empty pages must fill them on the first tick, not
 * after an hour.
 */
export function sourceIsDue(
  src: NewsBulletinSource,
  lastRunAt: number | undefined,
  nowMs: number,
  globalIntervalMs: number,
): boolean {
  if (lastRunAt === undefined) return true;
  return nowMs - lastRunAt >= (src.intervalMs ?? globalIntervalMs);
}

/**
 * Fetch and parse, keeping the ITEMS as data as well as the page as text.
 *
 * The magazine needs a headline and a summary per story, not the rendered
 * bulletin - and it must not ask the feeds again to get them, because a second
 * request per source per tick is exactly the hammering the host gate exists to
 * prevent. So the one fetch serves both consumers.
 */
async function fetchSourceItems(
  src: NewsBulletinSource,
  deps: NewsBulletinDeps,
): Promise<{
  body: string | null;
  items: Array<{ headline: string; summary: string; source: string; url?: string }>;
}> {
  if (src.kind === 'teletext') {
    const body = src.page ? await deps.fetchPage(src.page) : null;
    // A teletext page is a whole page, not a list of stories. It feeds the
    // bulletins and nothing else - the magazine's desks are fed by real feeds.
    return { body, items: [] };
  }
  if (!src.url) return { body: null, items: [] };
  if (!deps.fetchUrl) {
    deps.log(`[WARN] news-bulletins: ${src.file} has no fetchUrl; keeping the file as it is`);
    return { body: null, items: [] };
  }
  const v = validators.get(src.file);
  const res = await deps.fetchUrl(src.url, { hostGapMs: src.hostGapMs, etag: v?.etag, lastModified: v?.lastModified });
  if (res.notModified) return { body: null, items: [] };
  if (!res.body) {
    // Name the source and the reason. Silence here is how a feed that 404s
    // forever looks exactly like a feed with nothing new.
    deps.log(`[WARN] news-bulletins: ${src.file} ${src.url} - ${res.error ?? 'no body'}`);
    return { body: null, items: [] };
  }
  if (res.etag || res.lastModified) validators.set(src.file, { etag: res.etag, lastModified: res.lastModified });
  const limit = src.limit ?? 12;
  let items: Array<{ headline: string; summary: string; source: string; url?: string }> = [];
  let body: string | null = null;
  try {
    if (src.kind === 'json') {
      body = parseJsonFeed(res.body, src, limit);
      items = jsonItems(res.body, src, limit);
    } else {
      const fetched = await parseFeedItems(res.body, src.source, limit);
      body = fetched.text;
      items = fetched.items;
    }
  } catch (err) {
    deps.log(`[WARN] news-bulletins: ${src.file} is not ${src.kind} this service can read (${(err as Error).message.split('\n')[0]})`);
    return { body: null, items: [] };
  }
  return { body, items };
}

/** Hand the magazine its material. Failure here never fails a bulletin. */
function deliverToMagazine(baseDir: string, file: string, items: unknown[]): void {
  if (!items.length) return;
  try {
    const dir = path.join(baseDir, 'Magazine', 'incoming');
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, `${file.replace(/\.txt$/, '')}.json`), JSON.stringify(items));
  } catch {
    /* the bulletin is already written; the magazine is the next tick's problem */
  }
}

export async function refreshNewsBulletins(
  deps: NewsBulletinDeps = defaultNewsBulletinDeps(),
  globalIntervalMs: number = NEWS_BULLETIN_INTERVAL_MS,
): Promise<NewsBulletinOutcome> {
  const dir = path.join(deps.baseDir(), 'Bulletins');
  const nowMs = deps.now().getTime();
  let written = false;
  let kept = false;
  for (const src of NEWS_BULLETIN_SOURCES) {
    const num = parseInt(src.file.replace(/\D/g, ''), 10);
    if (Number.isFinite(num) && OWNED_BULLETIN_NUMBERS.has(num)) {
      deps.log(`[WARN] news-bulletins: ${src.file} is another door's number; refusing to write it`);
      continue;
    }
    // A source with its own interval runs on it; `due` is false while it waits.
    if (!sourceIsDue(src, lastRun.get(src.file), nowMs, globalIntervalMs)) continue;

    let body: string | null = null;
    let items: Array<{ headline: string; summary: string; source: string; url?: string }> = [];
    try {
      const fetched = await fetchSourceItems(src, deps);
      body = fetched.body;
      items = fetched.items;
    } catch (err) {
      deps.log(`[WARN] news-bulletins: ${src.file} fetch failed (${(err as Error).message})`);
    }
    deliverToMagazine(deps.baseDir(), src.file, items);
    if (!body) {
      kept = true;
      continue;
    }
    lastRun.set(src.file, nowMs);
    // Folded to forty BEFORE the CRLF pass: a C64 caller has forty columns,
    // and text that fits forty reads correctly at eighty.
    const folded = foldBulletin(
      `${src.title}\nUpdated ${deps.now().toISOString()}\n\n${body}\n\nSource: ${src.source}`,
    );
    const text = toCRLF(fitNewsBulletin(folded, BULLETIN_ROWS));
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
      .then(async () => {
        // The tick dropped new material in the magazine's inbox; nothing else
        // will empty it. Composing here is what makes the editorial layer part
        // of the running board rather than a module nobody calls.
        try {
          const { refreshMagazine } = await import('./magazine');
          const out = refreshMagazine({
            rootDir: deps.baseDir,
            now: deps.now,
            log: deps.log,
          });
          if (out.added > 0) deps.log(`[magazine] ${out.added} new stories, ${out.pages} pages`);
        } catch (err) {
          // The bulletins are already written. A magazine that did not compose
          // this tick is worth saying out loud, never worth crashing the board.
          deps.log(`[WARN] news-bulletins: magazine did not compose (${(err as Error).message})`);
        }
      })
      .catch((err: Error) => deps.log(`[WARN] news-bulletins: refresh failed: ${err.message}`))
      .finally(() => { running = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

/** Test seam: forget which sources have run and what validators they hold. */
export function resetNewsBulletinSchedule(): void {
  lastRun.clear();
  validators.clear();
  hostGate.clear();
}
