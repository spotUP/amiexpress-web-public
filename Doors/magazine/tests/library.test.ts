/**
 * The library reads what the board's magazine service wrote, and degrades to
 * "less magazine" - never an exception - when the disk is partial.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  ARTICLE_MIN_BODY_CHARS,
  COVER_SIZE,
  coverEntries,
  newestFirst,
  type Desk,
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { deskGroups } from '../layout';
import { isListed, loadTickerItems, loadIndex, loadSnapshot, loadStory, paintSafe, searchStories, storiesPerDay } from '../library';

function tmpMagazine(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mag-lib-'));
}

const entry = (page: number, storyId: string, title: string, date = '2026-10-13'): MagazineIndexEntry => ({
  page, storyId, title, desk: 'hack', format: 'NEWS', date,
});

const story = (id: string, headline: string, summary: string, extra: Partial<Story> = {}): Story => ({
  id, headline, summary, format: 'NEWS', desk: 'hack', date: '2026-10-13', source: 'example.org',
  firstSeen: '2026-10-13', seenCount: 1, origin: 'authored', ...extra,
});

/** Write the stories (authored by default, so they are articles) under `<root>/stories`. */
function putStories(root: string, ...stories: Story[]): void {
  fs.mkdirSync(path.join(root, MAGAZINE_STORIES_DIR), { recursive: true });
  for (const st of stories) fs.writeFileSync(path.join(root, MAGAZINE_STORIES_DIR, `${st.id}.json`), JSON.stringify(st));
}

export async function aMissingMagazineIsEmptyNotAnError(): Promise<void> {
  const root = path.join(tmpMagazine(), 'nope');
  assert.deepStrictEqual(loadIndex(root), []);
  assert.strictEqual(loadStory('deadbeef', root), null);
  assert.deepStrictEqual(loadSnapshot(root), { index: [] });
}

export async function aHalfWrittenFileIsTreatedAsMissing(): Promise<void> {
  const root = tmpMagazine();
  fs.writeFileSync(path.join(root, MAGAZINE_INDEX_FILE), '[{"page":101,');
  assert.deepStrictEqual(loadIndex(root), []);
}

export async function indexEntriesWithoutTheShapeAreDroppedAndPagesSorted(): Promise<void> {
  const root = tmpMagazine();
  fs.writeFileSync(
    path.join(root, MAGAZINE_INDEX_FILE),
    JSON.stringify([entry(120, 'bbbb', 'B'), { page: 'x' }, null, entry(101, 'aaaa', 'A')]),
  );
  putStories(root, story('bbbb', 'B', ''), story('aaaa', 'A', ''));
  assert.deepStrictEqual(loadIndex(root).map((e) => e.page), [101, 120]);
}

export async function aStoryIsReadByIdAndAnIdThatIsNotAFileNameIsRefused(): Promise<void> {
  const root = tmpMagazine();
  fs.mkdirSync(path.join(root, MAGAZINE_STORIES_DIR));
  fs.writeFileSync(path.join(root, MAGAZINE_STORIES_DIR, 'abc123.json'), JSON.stringify(story('abc123', 'Head', 'Body')));
  fs.writeFileSync(path.join(root, 'secret.json'), JSON.stringify(story('x', 'secret', '')));
  assert.strictEqual(loadStory('abc123', root)?.headline, 'Head');
  assert.strictEqual(loadStory('../secret', root), null, 'a story id must not climb out of stories/');
  assert.strictEqual(loadStory('', root), null);
}

export async function aStoryMissingItsSummaryStillLoads(): Promise<void> {
  const root = tmpMagazine();
  fs.mkdirSync(path.join(root, MAGAZINE_STORIES_DIR));
  fs.writeFileSync(path.join(root, MAGAZINE_STORIES_DIR, 'a1.json'), JSON.stringify({ id: 'a1', headline: 'H' }));
  const s = loadStory('a1', root);
  assert.strictEqual(s?.summary, '');
  assert.strictEqual(s?.source, '');
}

export async function paintSafeFoldsTypographyAndMarksWhatNothingCanShow(): Promise<void> {
  assert.strictEqual(paintSafe('“It’s” – done…'), '"It\'s" - done...');
  assert.strictEqual(paintSafe('café'), 'café', 'Latin-1 survives');
  assert.strictEqual(paintSafe('日本'), '??');
}

export async function searchMatchesEveryWordInHeadlineOrSummary(): Promise<void> {
  const entries = [entry(101, 'a', 'Copper Lights'), entry(102, 'b', 'Other')];
  const stories: Record<string, Story> = {
    a: story('a', 'Copper Lights', 'A new intro by Skaven'),
    b: story('b', 'Other', 'Mentions copper too'),
  };
  const load = (id: string) => stories[id] ?? null;
  assert.deepStrictEqual(searchStories(entries, 'copper', load).map((e) => e.storyId), ['a', 'b']);
  assert.deepStrictEqual(searchStories(entries, 'copper skaven', load).map((e) => e.storyId), ['a']);
  assert.deepStrictEqual(searchStories(entries, '   ', load), []);
  assert.deepStrictEqual(searchStories(entries, 'zzz', load), []);
}

export async function storiesPerDayCountsTheNewestDaysOldestFirst(): Promise<void> {
  const entries = [
    entry(1, 'a', 'x', '2026-10-11'), entry(2, 'b', 'x', '2026-10-12'),
    entry(3, 'c', 'x', '2026-10-12'), entry(4, 'd', 'x', '2026-10-13'),
  ];
  assert.deepStrictEqual(storiesPerDay(entries, 8), [1, 2, 1]);
  assert.deepStrictEqual(storiesPerDay(entries, 2), [2, 1]);
}

export async function coverEntriesAreTheNewestSixByDateThenFirstSeenThenId(): Promise<void> {
  const e = (id: string, date: string, firstSeen?: string): MagazineIndexEntry => ({ ...entry(100, id, id, date), firstSeen });
  const index = [
    e('old', '2026-10-01'), e('d1', '2026-10-13'), e('d2a', '2026-10-12', '2026-10-12T08'), e('d2b', '2026-10-12', '2026-10-12T09'),
    e('tieA', '2026-10-11', '2026-10-11T08'), e('tieB', '2026-10-11', '2026-10-11T08'), e('nofs', '2026-10-11'), e('d0', '2026-10-09'),
  ];
  assert.deepStrictEqual(coverEntries(index).map((x) => x.storyId), ['d1', 'd2b', 'd2a', 'tieB', 'tieA', 'nofs']);
  assert.strictEqual(COVER_SIZE, 6);
  assert.deepStrictEqual(coverEntries([]), []);
  assert.strictEqual(newestFirst({ date: 'a' }, { date: 'a' }), 0);
}

export async function deskGroupsAreOrderedByTheirFreshestStoryTiesKeepSectionOrder(): Promise<void> {
  const e = (page: number, id: string, desk: Desk, date: string, firstSeen?: string): MagazineIndexEntry => ({ ...entry(page, id, id, date), desk, firstSeen });
  const groups = deskGroups([
    e(120, 'h1', 'hack', '2026-10-12'), e(121, 'h2', 'hack', '2026-10-12', '2026-10-12T05'),
    e(201, 's1', 'scene', '2026-10-13'), e(301, 'g1', 'graffiti', '2026-10-12'), e(302, 'm1', 'music', '2026-10-12'),
  ]);
  assert.deepStrictEqual(groups.map((g) => g.desk), ['scene', 'hack', 'graffiti', 'music']);
  assert.deepStrictEqual(groups[1].entries.map((x) => x.storyId), ['h2', 'h1'], 'inside a desk: newest first');
  const samePage = deskGroups([e(130, 'b', 'hack', '2026-10-12'), e(125, 'a', 'hack', '2026-10-12')]);
  assert.deepStrictEqual(samePage[0].entries.map((x) => x.storyId), ['a', 'b'], 'a full tie falls back to page ascending');
}

const TEASER_ONLY = (id: string, headline: string, date = '2026-10-13'): Story =>
  story(id, headline, 'A short teaser.', { origin: 'feed', date });

export async function theIndexAndSearchHideEveryStoryThatIsNotAnArticle(): Promise<void> {
  const root = tmpMagazine();
  putStories(
    root,
    story('art1', 'Relay computers explained', ''),
    TEASER_ONLY('tea1', 'Relay clock teaser'),
    story('long', 'Fed with a full body', 'x', { origin: 'feed', body: 'b'.repeat(ARTICLE_MIN_BODY_CHARS) }),
    story('shrt', 'Fed with a short body', 'x', { origin: 'feed', body: 'b'.repeat(ARTICLE_MIN_BODY_CHARS - 1) }),
  );
  fs.writeFileSync(
    path.join(root, MAGAZINE_INDEX_FILE),
    JSON.stringify(['art1', 'tea1', 'long', 'shrt', 'gone'].map((id, i) => entry(100 + i, id, `Relay ${id}`))),
  );
  assert.deepStrictEqual(loadIndex(root).map((e) => e.storyId), ['art1', 'long']);
  assert.deepStrictEqual(searchStories(loadIndex(root), 'relay').map((e) => e.storyId), ['art1', 'long']);
  assert.strictEqual(isListed('tea1', root), false);
  assert.strictEqual(isListed('shrt', root), false);
  assert.strictEqual(isListed('art1', root), true);
}

export async function theTickerCarriesTheNewestHeadlinesOfEveryStoryTeasersIncluded(): Promise<void> {
  const root = tmpMagazine();
  putStories(root, story('art1', 'An article', '', { date: '2026-10-10' }), TEASER_ONLY('tea1', 'A teaser headline', '2026-10-14'), TEASER_ONLY('tea2', 'Older teaser', '2026-10-01'));
  assert.deepStrictEqual(loadTickerItems(2, root), [
    { source: 'example.org', title: 'A teaser headline' },
    { source: 'example.org', title: 'An article' },
  ]);
  assert.deepStrictEqual(loadTickerItems(5, path.join(root, 'nope')), []);
}
