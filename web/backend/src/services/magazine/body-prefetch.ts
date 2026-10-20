/**
 * FULL TEXT FOR THE MAGAZINE, FETCHED AT INGEST.
 *
 * A feed that only sends a teaser leaves a story that is not yet an article. The
 * story page usually has the whole piece, so for each NEW story whose feed
 * carried no full text this module fetches the page once, in the background,
 * and keeps the main article text as `story.body`. A story with a long enough
 * body opens as an article in the reader (`isArticle`); one whose page could
 * not be read stays hidden and is purged after three days.
 *
 * The manners are the point, because this talks to other people's sites:
 *   - robots.txt is read once per host (cached a day) and obeyed for the
 *     article path; a fetch error on robots.txt means "do not ask yet"
 *   - the request says who we are (`BOARD_USER_AGENT`)
 *   - every request, robots.txt included, goes through the news-bulletins HOST
 *     GATE, so one page at a time per host and never faster than the gap
 *   - a story is asked about ONCE: a failure is written to the story
 *     (`bodyFailed`) and never retried, and a story that has a body is never
 *     fetched again
 *   - it runs after the bulletin tick has finished and is never awaited by it
 *
 * Extraction is @mozilla/readability (the algorithm behind Firefox reader
 * view; maintained by Mozilla, one runtime-dependency-free package) over
 * linkedom (a small DOM, a fraction of jsdom's weight). The text then goes
 * through `toBulletinWalk`, the one HTML-to-text path the summaries use.
 */
import axios from 'axios';
import * as path from 'path';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { MAGAZINE_DIR, MAGAZINE_STORIES_DIR, SIDECAR_RENDER_REVISION, STORY_BODY_CAP, sidecarPath, type Story, type StoryMedia } from '@amiexpress/bbs-door-sdk/formats/magazine';
import * as fs from 'fs';
import {
  FEED_BODY_MIN_CHARS,
  NEWS_BULLETIN_SOURCES,
  hostOf,
  passHostGate,
  toBulletinWalk,
} from '../news-bulletins';
import { loadStories, republishMagazine, writeAtomic } from './index';
import { readSidecar, renderStoryMedia } from './media-render';
import type { frameToAnsiCells } from '@amiexpress/bbs-door-sdk/media/ascii';

/** How long one request may take, robots.txt and the page alike. */
export const ARTICLE_FETCH_TIMEOUT_MS = 15000;
/** Minimum gap between two requests to one host (the host gate's unit). */
export const ARTICLE_HOST_GAP_MS = 5000;
/** Stories asked about per run: bounds the time a run holds the gate. */
export const PREFETCH_MAX_PER_RUN = 12;
/** Only stories first seen this recently are fetched; the archive is not back-filled. */
export const PREFETCH_MAX_AGE_DAYS = 7;
/** A host's robots.txt is trusted this long. */
export const ROBOTS_TTL_MS = 24 * 3600 * 1000;
/** A failed robots.txt fetch is not asked again for this long. */
export const ROBOTS_ERROR_TTL_MS = 3600 * 1000;
/** The biggest page read; Readability on more than this is a stall, not a story. */
export const MAX_PAGE_BYTES = 2_000_000;

/** The product token robots.txt groups are matched against. */
export const BOARD_AGENT_TOKEN = 'AmiExpress-BBS-Magazine';
export const BOARD_USER_AGENT = `${BOARD_AGENT_TOKEN}/1.0 (The Unknown Frequency, a BBS magazine; reads a story page once for its reader; https://bbs.uprough.net)`;

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/**
 * The rules that apply to this board: the group naming our product token if
 * there is one, else the `*` group (RFC 9309 section 2.2.1). Not a full
 * parser: no sitemaps, no crawl-delay (the host gate's gap is the delay).
 */
export function parseRobots(text: string, token: string = BOARD_AGENT_TOKEN): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    if (key === 'disallow' && value) current.disallow.push(value);
  }
  const lower = token.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && lower.includes(a)));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
  };
}

function ruleMatches(rule: string, target: string): number {
  // `*` matches any run, a trailing `$` anchors the end; the rest is literal.
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp(`^${body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`);
  return re.test(target) ? body.replace(/\*/g, '').length : -1;
}

/** The longest matching rule wins; Allow wins a tie (RFC 9309 section 2.2.2). */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow) {
    const n = ruleMatches(r, pathAndQuery);
    if (n > best) { best = n; allowed = false; }
  }
  for (const r of rules.allow) {
    const n = ruleMatches(r, pathAndQuery);
    if (n >= best && n >= 0) { best = n; allowed = true; }
  }
  return allowed;
}

type RobotsEntry =
  | { kind: 'rules'; rules: RobotsRules; until: number }
  | { kind: 'unreachable'; until: number };

/** One verdict per host, in memory for the life of the process. */
export type RobotsCache = Map<string, RobotsEntry>;

export function createRobotsCache(): RobotsCache {
  return new Map();
}

// ---------------------------------------------------------------------------
// Fetching and extracting
// ---------------------------------------------------------------------------

export interface HttpResult {
  status: number;
  body: string | null;
  contentType?: string;
  error?: string;
}

/** An article's text and the media found beside it by the same walk. */
export interface ExtractedArticle {
  body: string;
  media: StoryMedia[];
}

export interface PrefetchDeps {
  rootDir: () => string;
  now: () => Date;
  log: (line: string) => void;
  /** One GET. Never throws: a transport failure comes back as `error`. */
  http: (url: string, opts: { timeoutMs: number; userAgent: string; accept: string }) => Promise<HttpResult>;
  /** The news-bulletins host gate. */
  gate: (url: string, gapMs: number) => Promise<void>;
  /**
   * Main article text of a page as plain paragraphs, or null when there is none.
   * An `ExtractedArticle` also carries the page's media; a bare string has none.
   */
  extract: (html: string, url: string) => string | ExtractedArticle | null;
  robots: RobotsCache;
  /** Test seams for the picture renderer (M7): the SDK converter and the tool lookup. */
  convert?: typeof frameToAnsiCells;
  tools?: import('./media-fetch').MediaTools;
  probe?: import('./media-fetch').MediaFetchDeps['probe'];
}

export async function fetchHttp(
  url: string,
  opts: { timeoutMs: number; userAgent: string; accept: string },
): Promise<HttpResult> {
  try {
    const res = await axios.get(url, {
      timeout: opts.timeoutMs,
      // timeout above is the socket's; the signal bounds the whole request.
      signal: AbortSignal.timeout(opts.timeoutMs),
      responseType: 'text',
      transformResponse: [(d) => d],
      maxContentLength: MAX_PAGE_BYTES,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': opts.userAgent, Accept: opts.accept },
    });
    return {
      status: res.status,
      body: typeof res.data === 'string' ? res.data : null,
      contentType: String(res.headers?.['content-type'] ?? ''),
    };
  } catch (err) {
    return { status: 0, body: null, error: (err as Error).message ?? String(err) };
  }
}

/** The last path segment of an address, so Ghost's /size/w1200/ and /size/w2000/ copies of one file compare equal. */
function fileOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').toLowerCase();
  } catch {
    return '';
  }
}

type PageDocument = ReturnType<typeof parseHTML>['document'];

/**
 * The page's lead picture: its og:image (or twitter:image), but only when the
 * page also shows that file in an img, so a social card that is only a logo
 * is not taken. Readability keeps the article's body and leaves a hero
 * figure above it out, so the lead picture is read from the whole page,
 * before Readability changes the document.
 */
function leadPicture(document: PageDocument, url: string): StoryMedia | null {
  const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]')
    ?? document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
  const raw = meta?.getAttribute('content')?.trim();
  if (!raw) return null;
  let lead: string;
  try {
    lead = new URL(raw, url).href;
  } catch {
    return null;
  }
  if (!/^https?:/i.test(lead)) return null;
  const file = fileOf(lead);
  if (!file) return null;
  for (const img of document.querySelectorAll('img')) {
    const sources = [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset'), img.getAttribute('data-srcset')]
      .filter((v): v is string => !!v)
      .flatMap((v) => v.split(',').map((c) => c.trim().split(/\s+/)[0]));
    if (sources.some((src) => { try { return fileOf(new URL(src, url).href) === file; } catch { return false; } })) {
      const site = new URL(url).hostname.replace(/^www\./i, '');
      return { url: lead, kind: 'image', alt: img.getAttribute('alt') ?? '', site, anchor: 0 };
    }
  }
  return null;
}

/**
 * Readability over linkedom, then the shared cleaner. Null when the page has
 * no article. The page's lead picture goes first when the body does not
 * already hold it, and the author's portrait (an image whose alt is the
 * byline, from the article's "about the author" box) is dropped.
 */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  try {
    const { document } = parseHTML(html);
    const lead = leadPicture(document, url);
    const article = new Readability(document as never, { charThreshold: 200 }).parse();
    if (!article?.content) return null;
    const walk = toBulletinWalk(article.content, STORY_BODY_CAP, url);
    if (walk.text.length < FEED_BODY_MIN_CHARS) return null;
    const byline = article.byline?.trim().toLowerCase();
    const media = walk.media.filter((m) => !(m.kind === 'image' && byline && m.alt.trim().toLowerCase() === byline));
    if (lead && !media.some((m) => fileOf(m.url) === fileOf(lead.url) || (m.poster && fileOf(m.poster) === fileOf(lead.url)))) {
      media.unshift(lead);
    }
    return { body: walk.text, media };
  } catch {
    return null;
  }
}

/** The text-only face of `extractArticle`. */
export function extractArticleText(html: string, url: string): string | null {
  return extractArticle(html, url)?.body ?? null;
}

export function defaultPrefetchDeps(base: Pick<PrefetchDeps, 'rootDir' | 'now' | 'log'>, robots: RobotsCache): PrefetchDeps {
  return { ...base, http: fetchHttp, gate: passHostGate, extract: extractArticle, robots };
}

export type Verdict = { kind: 'allowed' } | { kind: 'disallowed' } | { kind: 'unknown'; reason: string };

export async function robotsVerdict(
  url: string,
  deps: Pick<PrefetchDeps, 'now' | 'robots' | 'gate' | 'http'>,
  gapMs: number,
): Promise<Verdict> {
  const u = new URL(url);
  const nowMs = deps.now().getTime();
  let entry = deps.robots.get(u.host);
  if (!entry || entry.until <= nowMs) {
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    await deps.gate(robotsUrl, gapMs);
    const res = await deps.http(robotsUrl, {
      timeoutMs: ARTICLE_FETCH_TIMEOUT_MS,
      userAgent: BOARD_USER_AGENT,
      accept: 'text/plain, */*',
    });
    if (res.status === 200 && res.body !== null) {
      entry = { kind: 'rules', rules: parseRobots(res.body), until: nowMs + ROBOTS_TTL_MS };
    } else if (res.status >= 400 && res.status < 500) {
      // No robots.txt (or none for us): everything is allowed (RFC 9309 section 2.3.1.3).
      entry = { kind: 'rules', rules: { allow: [], disallow: [] }, until: nowMs + ROBOTS_TTL_MS };
    } else {
      entry = { kind: 'unreachable', until: nowMs + ROBOTS_ERROR_TTL_MS };
    }
    deps.robots.set(u.host, entry);
  }
  if (entry.kind === 'unreachable') return { kind: 'unknown', reason: `robots.txt of ${u.host} unreachable` };
  return robotsAllows(entry.rules, `${u.pathname}${u.search}`) ? { kind: 'allowed' } : { kind: 'disallowed' };
}

// ---------------------------------------------------------------------------
// Choosing and recording
// ---------------------------------------------------------------------------

/** A story the prefetch should ask about: new, with an address, never asked, no text. */
export function needsBody(story: Story, nowMs: number): boolean {
  if (story.body || story.bodyFailed || !story.url) return false;
  if (story.origin === 'authored') return false;
  if (!/^https?:\/\//i.test(story.url)) return false;
  const seen = Date.parse(story.firstSeen);
  return Number.isFinite(seen) && nowMs - seen <= PREFETCH_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

/**
 * A story that has its text and lists pictures but has no sidecar: its text
 * came before pictures were rendered at ingest, or the render was cut short.
 * A picture with a `failure` never counts, so a story whose pictures all
 * failed is not asked again. The exception is 'story-cap', left by the old
 * per-story picture cap: those pictures were never tried, so the story is
 * asked again even though it has a sidecar. So is a sidecar whose pictures
 * were rendered under an older SIDECAR_RENDER_REVISION.
 */
export function needsMedia(story: Story, root: string, nowMs: number): boolean {
  if (!story.body || story.origin === 'authored') return false;
  const capped = story.media?.some((m) => m.failure === 'story-cap') ?? false;
  if (!capped && !story.media?.some((m) => !m.failure)) return false;
  const seen = Date.parse(story.firstSeen);
  if (!Number.isFinite(seen) || nowMs - seen > PREFETCH_MAX_AGE_DAYS * 24 * 3600 * 1000) return false;
  if (capped) return true;
  const file = storyFile(root, story.id);
  if (!fs.existsSync(sidecarPath(file))) return true;
  // Pictures rendered under an older SIDECAR_RENDER_REVISION are redone.
  return readSidecar(file)?.pictures.some((p) => p.render !== SIDECAR_RENDER_REVISION) ?? true;
}

/** The gap for a story's host: the board's gap, widened to the feed's own when it is the same host. */
export function gapFor(story: Story): number {
  const src = NEWS_BULLETIN_SOURCES.find((s) => s.source === story.source && s.url);
  const same = src?.url && story.url && hostOf(src.url) === hostOf(story.url);
  return Math.max(ARTICLE_HOST_GAP_MS, same ? (src?.hostGapMs ?? 0) : 0);
}

function storyFile(root: string, id: string): string {
  return path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR, `${id}.json`);
}

/**
 * Write the result into the story's file. The file is re-read here, after the
 * (slow) fetch: the ingest may have rewritten it meanwhile, and a read-modify-
 * write with no `await` between the read and the write cannot lose its update.
 */
function record(root: string, id: string, patch: Partial<Story>): boolean {
  let current: Story;
  try {
    current = JSON.parse(fs.readFileSync(storyFile(root, id), 'utf8'));
  } catch {
    return false;
  }
  if (current.body) return false; // someone else filled it; never overwrite
  writeAtomic(storyFile(root, id), JSON.stringify({ ...current, ...patch }, null, 2));
  return true;
}

/** Write a story's media list back, keeping everything else the ingest may have changed meanwhile. */
function recordMedia(root: string, id: string, media: StoryMedia[]): void {
  let current: Story;
  try {
    current = JSON.parse(fs.readFileSync(storyFile(root, id), 'utf8'));
  } catch {
    return;
  }
  writeAtomic(storyFile(root, id), JSON.stringify({ ...current, media }, null, 2));
}

export interface PrefetchSummary {
  fetched: number;
  /** Stories that had their text already and got their pictures in this run. */
  pictured: number;
  failed: number;
  deferred: number;
}

/** Ask the story pages for the full text of new stories. See the file comment for the manners. */
export async function prefetchBodies(deps: PrefetchDeps): Promise<PrefetchSummary> {
  const root = deps.rootDir();
  const nowMs = deps.now().getTime();
  const nowIso = deps.now().toISOString();
  const stories = loadStories(path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR), deps.log)
    .filter((s) => needsBody(s, nowMs))
    .sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1))
    .slice(0, PREFETCH_MAX_PER_RUN);
  const out: PrefetchSummary = { fetched: 0, pictured: 0, failed: 0, deferred: 0 };

  for (const story of stories) {
    const url = story.url as string;
    const fail = (reason: string) => {
      record(root, story.id, { bodyFailed: { at: nowIso, reason } });
      out.failed++;
      deps.log(`[magazine] body: ${story.source} no article text (${reason})`);
    };
    let verdict: Verdict;
    try {
      verdict = await robotsVerdict(url, deps, gapFor(story));
    } catch (err) {
      fail(`bad url (${(err as Error).message})`);
      continue;
    }
    if (verdict.kind === 'unknown') { out.deferred++; continue; } // asked again after the error TTL
    if (verdict.kind === 'disallowed') { fail('robots.txt disallows this path'); continue; }

    await deps.gate(url, gapFor(story));
    const res = await deps.http(url, {
      timeoutMs: ARTICLE_FETCH_TIMEOUT_MS,
      userAgent: BOARD_USER_AGENT,
      accept: 'text/html, application/xhtml+xml',
    });
    if (res.status !== 200 || res.body === null) {
      fail(res.error ? `fetch failed: ${res.error}` : `HTTP ${res.status}`);
      continue;
    }
    if (res.contentType && !/html|xml/i.test(res.contentType)) { fail(`not a web page (${res.contentType})`); continue; }
    const extracted = deps.extract(res.body, url);
    const article = typeof extracted === 'string' ? { body: extracted, media: [] } : extracted;
    if (!article?.body) { fail('no article text on the page'); continue; }
    const { body } = article;
    // Pictures are fetched, converted and stored at ingest (D1); a failure is
    // recorded once on the media entry and the text is unchanged (D6).
    let media = article.media;
    if (media.length) {
      const rendered = await renderStoryMedia({ media }, storyFile(root, story.id), deps, writeAtomic);
      media = rendered.media ?? media;
      deps.log(`[magazine] media: ${story.source} ${rendered.rendered} rendered, ${rendered.failed} dropped`);
    }
    if (record(root, story.id, { body, ...(media.length ? { media } : {}) })) {
      out.fetched++;
      deps.log(`[magazine] body: ${story.source} ${body.length} characters`);
    }
  }

  // Stories whose text came before their pictures were rendered get them now.
  const unpictured = loadStories(path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR), deps.log)
    .filter((s) => needsMedia(s, root, nowMs))
    .sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1))
    .slice(0, PREFETCH_MAX_PER_RUN);
  for (const story of unpictured) {
    const rendered = await renderStoryMedia(story, storyFile(root, story.id), deps, writeAtomic);
    if (rendered.media) recordMedia(root, story.id, rendered.media);
    if (rendered.rendered) out.pictured++;
    deps.log(`[magazine] media: ${story.source} ${rendered.rendered} rendered, ${rendered.failed} dropped`);
  }
  return out;
}

let running = false;
/** The process's one robots cache: ingest and the live video converter ask the same verdicts. */
export const robotsByProcess = createRobotsCache();

/**
 * Start a prefetch run without waiting for it. One at a time: the next tick
 * finding the last still sleeping on the host gate simply does not start
 * another. Never throws and never blocks the caller.
 */
export function startBodyPrefetch(base: Pick<PrefetchDeps, 'rootDir' | 'now' | 'log'>, deps?: PrefetchDeps): void {
  if (running) return;
  running = true;
  prefetchBodies(deps ?? defaultPrefetchDeps(base, robotsByProcess))
    .then((r) => {
      if (r.fetched || r.pictured || r.failed) base.log(`[magazine] body prefetch: ${r.fetched} filled, ${r.pictured} pictured, ${r.failed} failed, ${r.deferred} deferred`);
      // A story that just got its text is an article now: give it its page.
      if (r.fetched) republishMagazine(base);
    })
    .catch((err: Error) => base.log(`[WARN] magazine: body prefetch failed (${err.message})`))
    .finally(() => { running = false; });
}
