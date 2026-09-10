/**
 * WEB_ plain-HTTP Text-TV proxy for 68K doors (and classic Amigas).
 *
 * api.texttv.nu is HTTPS-only (plain HTTP 301s); the 68K stack cannot do
 * TLS, so no door can fetch it directly. Node fetches over TLS and serves
 * the verbatim JSON array over plain HTTP. Public, read-only, validated
 * page range, short in-memory cache per page (a reader turning pages must
 * not hammer the mirror; five minutes is fresh for teletext).
 *
 * Same upstream contract as handlers/sysop-ai/external/texttv.ts and
 * services/news-bulletins.ts (keyless, `app=` mandatory) - one fetcher
 * shape, three readers.
 */

export const TEXTTV_API = 'https://api.texttv.nu/api/get';
export const TEXTTV_APP = 'amiexpress-web-bbs';
export const TEXTTV_TIMEOUT_MS = 15000;
export const TEXTTV_CACHE_MS = 5 * 60 * 1000;

export type TextTvFetcher = (url: string, init?: any) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

const defaultFetcher: TextTvFetcher = (url, init) =>
  fetch(url, init) as unknown as Promise<{ status: number; text(): Promise<string> }>;

interface CacheEntry {
  at: number;
  status: number;
  body: string;
}

const cache = new Map<number, CacheEntry>();

/** Test seam: drop the cache between cases. */
export function clearTextTvCache(): void {
  cache.clear();
}

export function texttvPageUrl(page: number): string {
  return `${TEXTTV_API}/${page}?app=${TEXTTV_APP}&includePlainTextContent=1`;
}

export function isTextTvPage(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 999
  );
}

export interface TextTvPage {
  status: number;
  body: string;
  cached: boolean;
}

/**
 * texttv.nu's `content` HTML to ANSI rows - the look content_plain
 * throws away: full-width color bars, double-height headlines, the
 * per-row palette. Mapped from the live markup 2026-09-10 (pages
 * 100,101,300,330,379,400,600,700):
 *
 * - a `line` span is one 40-column row; `toprow` is the same shape.
 * - `DH` is double-height: the row is emitted twice, the way broadcast
 *   spends two rows on it (the markup's own filler row is skipped - it
 *   carries no text, only background).
 * - backgrounds bgBl/bgB/bgW/bgY -> 44/40/47/43; foregrounds
 *   W/Y/B/C/G/bl -> 37/33/30/36/32/34 (R/M by WST symmetry, unobserved).
 *   Unknown classes are ignored, never guessed.
 * - `bgImg` mosaic cells are per-character GIFs - no terminal can draw
 *   them. Their text is a space, so the color bands survive and the art
 *   does not (documented gap: a glyph-hash to mosaic table).
 * - SGR is `\x1b[0;fg;bgm` on change (the 0 clears, never sets bold),
 *   `\x1b[0m` at row end. Rows join with \n for the door's pager.
 */
const TELETEXT_BG: Record<string, number> = { bgBl: 44, bgB: 40, bgW: 47, bgY: 43 };
const TELETEXT_FG: Record<string, number> = {
  W: 37, Y: 33, B: 30, C: 36, G: 32, bl: 34, R: 31, M: 35,
};
const TELETEXT_DEFAULT_FG = 37;
const TELETEXT_DEFAULT_BG = 40;

function decodeTeletextEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, digits) => {
      const code = Number(digits);
      return code >= 32 && code <= 255 ? String.fromCharCode(code) : '?';
    });
}

export function htmlToAnsiRows(html: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let fg = TELETEXT_DEFAULT_FG;
  let bg = TELETEXT_DEFAULT_BG;
  let emittedFg = -1;
  let emittedBg = -1;
  let dh = false;
  let rowOpen = false;

  const flushRow = (): void => {
    if (!rowOpen) return;
    if (cur !== '') {
      const line = cur + '\x1b[0m';
      rows.push(line);
      if (dh) rows.push(line);
    }
    cur = '';
    fg = TELETEXT_DEFAULT_FG;
    bg = TELETEXT_DEFAULT_BG;
    emittedFg = -1;
    emittedBg = -1;
    dh = false;
    rowOpen = false;
  };

  const paint = (text: string): void => {
    if (text === '') return;
    if (fg !== emittedFg || bg !== emittedBg) {
      cur += `\x1b[0;${fg};${bg}m`;
      emittedFg = fg;
      emittedBg = bg;
    }
    cur += text;
  };

  const tokens = html.match(/(<[^>]*>|[^<]+)/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<')) {
      const cls = token.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
      if (/\bline\b/.test(token) && (token.startsWith('<span') || token.startsWith('<div'))) {
        flushRow();
        rowOpen = true;
        dh = cls.includes('DH');
        continue;
      }
      if (token.startsWith('</') || token.startsWith('<div')) continue;
      for (const c of cls) {
        if (c in TELETEXT_BG) bg = TELETEXT_BG[c];
        else if (c in TELETEXT_FG) fg = TELETEXT_FG[c];
      }
    } else {
      if (!rowOpen) continue;
      paint(decodeTeletextEntities(token));
    }
  }
  flushRow();
  return rows;
}

/** Rows joined for the door: one string, \n separators, no trailing newline. */
export function htmlToAnsiText(html: string): string {
  return htmlToAnsiRows(html).join('\n');
}

/**
 * Slim an upstream page array to what a 68K door can hold: the HTML
 * `content` half of a page is ~26KB of divs the door never reads, and a
 * door-side buffer big enough for the fattest page is chip RAM that
 * every page pays for. Keeps num/title/content_plain/next_page/
 * prev_page verbatim, and adds `ansi`: the content HTML converted to
 * ANSI rows (colors, double-height, bars - see htmlToAnsiRows). An empty
 * upstream array (off-air page) stays an empty array so the door still
 * reports "not on air", not silence.
 */
export function slimTextTvBody(upstreamBody: string): string {
  const parsed: unknown = JSON.parse(upstreamBody);
  if (!Array.isArray(parsed)) {
    throw new Error('texttv: upstream did not answer an array');
  }
  const slim = parsed.map((row: any) => {
    const html = Array.isArray(row?.content) ? row.content.join('') : '';
    return {
      num: row?.num ?? null,
      title: row?.title ?? null,
      content_plain: row?.content_plain ?? null,
      next_page: row?.next_page ?? null,
      prev_page: row?.prev_page ?? null,
      ansi: html !== '' ? htmlToAnsiText(html) : null,
    };
  });
  return JSON.stringify(slim);
}

/**
 * Fetch one page's JSON array (verbatim bytes - the door parses and
 * converts). Throws on transport failure or non-200 upstream; the route
 * turns that into a 502 so a door can tell "mirror silent" from "no page".
 */
export async function fetchTextTvPage(
  page: number,
  fetcher: TextTvFetcher = defaultFetcher,
): Promise<TextTvPage> {
  if (!isTextTvPage(page)) {
    throw new Error(`texttv: page ${String(page)} is not 100-999`);
  }
  const now = Date.now();
  const hit = cache.get(page);
  if (hit && now - hit.at < TEXTTV_CACHE_MS) {
    return { status: hit.status, body: hit.body, cached: true };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TEXTTV_TIMEOUT_MS);
  try {
    const res = await fetcher(texttvPageUrl(page), {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'amiexpress-web-bbs/1.0 (BBS Text-TV proxy; https://bbs.uprough.net)',
        Accept: 'application/json',
      },
    });
    const body = await res.text();
    if (res.status !== 200) {
      throw new Error(`texttv: upstream answered ${res.status}`);
    }
    const slim = slimTextTvBody(body);
    cache.set(page, { at: now, status: res.status, body: slim });
    return { status: res.status, body: slim, cached: false };
  } finally {
    clearTimeout(timer);
  }
}
