/**
 * THE MAGAZINE, ASSEMBLED.
 *
 * Three stores, three jobs:
 *
 *   `incoming/`  what the feeds just produced, this tick. Disposable.
 *   `stories/`   every story the magazine has ever seen, deduplicated. The
 *                archive (§13: "previous stories remain useful"). Hand-editable.
 *   `frontpage.json`  the stories a HUMAN approved (§17 forbids a magazine
 *                that is an automated list, so selection is not ours to make).
 *
 * The composition step writes `pages/` as plain 40-column text plus an index,
 * and leaves the display transform to whoever owns the teletext engine. Every
 * page a caller can reach is on disk before anything is shown to anyone.
 */
import * as fs from 'fs';
import * as path from 'path';
import { GENERATED_SCREEN_ROWS } from '../../screens/screen-rows';
import { classify, classifyFormat, familyFor } from './classify';
import {
  composeIndexPage,
  composeStoryPage,
  renderPage,
  toWidth,
  PAGE_WIDTH,
  type ComposedPage,
} from './compose';
import { isSameStory, isWorthReading, storyId, type Desk, type Story } from './story-store';

/** One item as a feed produced it, before the magazine has opinions about it. */
export interface IncomingItem {
  headline: string;
  summary: string;
  source: string;
  url?: string;
  date?: string;
}

export interface MagazineIndexEntry {
  page: number;
  title: string;
  desk: Desk;
  format: string;
  storyId: string;
  date: string;
}

export interface MagazineLayout {
  index: MagazineIndexEntry[];
  /** Page number per desk family's first (index) page. */
  familyPages: Record<Desk, number>;
}

export interface MagazineDeps {
  rootDir: () => string;
  now: () => Date;
  log: (line: string) => void;
}

const MAGAZINE = 'Magazine';

function writeAtomic(target: string, contents: string): void {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, contents, 'latin1');
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* the target is untouched */ }
    throw err;
  }
}

/** Read a story directory into memory. A story that will not parse is skipped. */
export function loadStories(dir: string, log: (l: string) => void = () => {}): Story[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const out: Story[] = [];
  for (const name of names) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch (err) {
      log(`[WARN] magazine: ${name} did not parse (${(err as Error).message}); skipped`);
    }
  }
  return out;
}

/**
 * §14 step 4, deduplicate. The same story arrives from four feeds with four
 * different headlines; the id is the NORMALISED headline, so a publisher's
 * suffix (" - The Hacker News") collapses away before the comparison.
 */
export function mergeIncoming(
  existing: Story[],
  items: IncomingItem[],
  nowIso: string,
  log: (l: string) => void = () => {},
): { stories: Story[]; added: number; duplicates: number; rejected: number } {
  const byId = new Map(existing.map((s) => [s.id, { ...s }]));
  let added = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const item of items) {
    const headline = (item.headline ?? '').trim();
    if (!headline) {
      rejected++;
      continue;
    }
    // §15: a story must add discovery, context or judgement. A headline that
    // is only the generic words is somebody else's press release, not ours.
    if (!isWorthReading(headline)) {
      rejected++;
      continue;
    }
    // The same story arrives with different words, not just different case -
    // so look for it by content, not by the id the exact string would give.
    const prior = [...byId.values()].find((s) => isSameStory(s.headline, headline));
    if (prior) {
      // Already known. The summary improves if this feed's is longer - a
      // syndication carries the full text where a headline feed carries a
      // sentence - so the archive gets the better copy, not the first.
      if ((item.summary ?? '').length > (prior.summary ?? '').length) {
        prior.summary = item.summary;
        if (item.url && !prior.url) prior.url = item.url;
      }
      prior.seenCount += 1;
      duplicates++;
      continue;
    }
    const story: Story = {
      id: storyId(headline),
      headline,
      summary: (item.summary ?? '').trim(),
      format: classifyFormat({ headline, summary: item.summary ?? '' }),
      desk: classify({ headline, summary: item.summary ?? '', source: item.source }),
      date: item.date ?? nowIso.slice(0, 10),
      source: item.source,
      url: item.url,
      firstSeen: nowIso,
      seenCount: 1,
    };
    byId.set(story.id, story);
    added++;
  }
  log(`[magazine] ingest: +${added} new, ${duplicates} duplicate, ${rejected} rejected`);
  return { stories: [...byId.values()], added, duplicates, rejected };
}

/**
 * Allocate a page to every story, newest first within its desk.
 *
 * A desk's range is finite (§12 gives twenty pages) and the archive is
 * unbounded, so a story that will not fit goes to the archive's own range
 * rather than being dropped. Nothing is deleted; §13 says the value of a page
 * must not disappear when a story gets old.
 */
export function allocatePages(stories: Story[]): Map<string, number> {
  const pages = new Map<string, number>();
  const nextByDesk = new Map<Desk, number>();
  const desks: Desk[] = ['general', 'hack', 'scene', 'music', 'graffiti', 'people', 'archive', 'stream'];
  for (const d of desks) nextByDesk.set(d, familyFor(d).first);

  const ordered = [...stories].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const story of ordered) {
    let desk = story.desk;
    let cursor = nextByDesk.get(desk) ?? familyFor(desk).first;
    if (cursor > familyFor(desk).last) {
      // The desk is full. The story goes to the transmissions stream, NOT the
      // archive - it is news, not history, and the two are different promises.
      desk = 'stream';
      cursor = nextByDesk.get('stream') ?? familyFor('stream').first;
      if (cursor > familyFor('stream').last) continue; // the magazine is genuinely full
      story.desk = 'stream';
      nextByDesk.set('stream', cursor + 1);
    } else {
      nextByDesk.set(desk, cursor + 1);
    }
    pages.set(story.id, cursor);
  }
  return pages;
}

/**
 * Compose every page and write them out.
 *
 * The front page is the ONLY page that is not simply every story: it carries
 * the stories a human approved, and when nothing has been approved it says so
 * rather than inventing an editorial opinion of its own.
 */
export function publishMagazine(
  stories: Story[],
  approvedIds: string[],
  deps: MagazineDeps,
): MagazineLayout {
  const root = deps.rootDir();
  const pagesDir = path.join(root, MAGAZINE, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });

  const pageOf = allocatePages(stories);
  const budget = Math.max(8, GENERATED_SCREEN_ROWS - 1);
  const byId = new Map(stories.map((s) => [s.id, s]));
  const index: MagazineIndexEntry[] = [];

  for (const story of stories) {
    const page = pageOf.get(story.id);
    if (!page) continue;
    const deskLabel = familyFor(story.desk).label;
    const composed: ComposedPage = composeStoryPage(
      {
        headline: story.headline,
        summary: story.summary,
        format: story.format,
        source: story.source,
        url: story.url,
        date: story.date,
      },
      page,
      deskLabel,
      budget,
    );
    writeAtomic(path.join(pagesDir, `p${String(page).padStart(3, '0')}.txt`), `${renderPage(composed)}\r\n`);
    index.push({
      page,
      title: story.headline,
      desk: story.desk,
      format: story.format,
      storyId: story.id,
      date: story.date,
    });
  }

  // Section index pages: the first page of each family lists that desk.
  const familyPages = {} as Record<Desk, number>;
  for (const desk of ['hack', 'scene', 'music', 'graffiti', 'people', 'archive', 'stream'] as Desk[]) {
    familyPages[desk] = familyFor(desk).first;
    const inDesk = index.filter((e) => e.desk === desk).sort((a, b) => b.page - a.page);
    const composed = composeIndexPage(
      inDesk.map((e) => ({ headline: e.title, format: e.format })),
      familyFor(desk).first,
      familyFor(desk).label,
      `${familyFor(desk).label} - LATEST`,
      budget,
    );
    writeAtomic(path.join(pagesDir, `p${String(familyFor(desk).first).padStart(3, '0')}.txt`), `${renderPage(composed)}\r\n`);
  }

  // The front page proper: human-approved stories only.
  const approved = approvedIds
    .map((id) => byId.get(id))
    .filter((s): s is Story => Boolean(s))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const frontTitle = approved.length
    ? 'TODAY'
    : 'AWAITING EDITOR';
  const frontComposed = composeIndexPage(
    approved.map((s) => ({ headline: s.headline, format: s.format })),
    100,
    'FRONT PAGE',
    frontTitle,
    budget,
  );
  writeAtomic(path.join(pagesDir, 'p100.txt'), `${renderPage(frontComposed)}\r\n`);

  fs.writeFileSync(path.join(root, MAGAZINE, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, MAGAZINE, 'frontpage.json'), JSON.stringify(approvedIds, null, 2), 'utf8');

  deps.log(`[magazine] published ${index.length} stories across ${new Set(index.map((e) => e.page)).size} pages`);
  return { index, familyPages };
}

/** The ids a human approved, read from disk. Missing file means none. */
export function readApproved(root: string): string[] {
  try {
    const raw = fs.readFileSync(path.join(root, MAGAZINE, 'frontpage.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeApproved(root: string, ids: string[]): void {
  fs.mkdirSync(path.join(root, MAGAZINE), { recursive: true });
  writeAtomic(path.join(root, MAGAZINE, 'frontpage.json'), JSON.stringify(ids, null, 2));
}

/**
 * One pass: read what the feeds produced, merge it into the archive, and
 * recompose. `incoming/` is cleared afterwards - the bulletins own that data
 * and the stories own their copy.
 */
export function refreshMagazine(deps: MagazineDeps): { added: number; duplicates: number; rejected: number; pages: number } {
  const root = deps.rootDir();
  const magDir = path.join(root, MAGAZINE);
  fs.mkdirSync(path.join(magDir, 'incoming'), { recursive: true });
  fs.mkdirSync(path.join(magDir, 'stories'), { recursive: true });

  const nowIso = deps.now().toISOString();
  const items: IncomingItem[] = [];
  const incomingDir = path.join(magDir, 'incoming');
  for (const name of fs.readdirSync(incomingDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(incomingDir, name), 'utf8'));
      if (Array.isArray(parsed)) items.push(...parsed);
    } catch (err) {
      deps.log(`[WARN] magazine: incoming/${name} did not parse (${(err as Error).message})`);
    }
  }

  const existing = loadStories(path.join(magDir, 'stories'), deps.log);
  const merged = mergeIncoming(existing, items, nowIso, deps.log);
  for (const story of merged.stories) {
    writeAtomic(path.join(magDir, 'stories', `${story.id}.json`), JSON.stringify(story, null, 2));
  }

  const layout = publishMagazine(merged.stories, readApproved(root), deps);

  // Clear the inbox: the stories own their copy now, and a stale item would be
  // re-merged (harmlessly) on every run forever.
  for (const name of fs.readdirSync(incomingDir)) {
    if (name.endsWith('.json')) fs.unlinkSync(path.join(incomingDir, name));
  }

  return {
    added: merged.added,
    duplicates: merged.duplicates,
    rejected: merged.rejected,
    pages: new Set(layout.index.map((e) => e.page)).size,
  };
}

export { PAGE_WIDTH, toWidth };