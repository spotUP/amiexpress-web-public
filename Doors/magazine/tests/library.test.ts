/**
 * The library reads what the board's magazine service wrote, and degrades to
 * "less magazine" - never an exception - when the disk is partial.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAGAZINE_FRONTPAGE_FILE,
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  ARTICLE_MIN_BODY_CHARS,
  frontLead,
  frontMove,
  frontToggle,
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { editFront, isListed, loadTickerItems, isSysopCaller, writeFront, loadFront, loadIndex, loadSnapshot, loadStory, paintSafe, searchStories, storiesPerDay } from '../library';

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
  assert.deepStrictEqual(loadFront(root), []);
  assert.strictEqual(loadStory('deadbeef', root), null);
  assert.deepStrictEqual(loadSnapshot(root), { index: [], front: [] });
}

export async function aHalfWrittenFileIsTreatedAsMissing(): Promise<void> {
  const root = tmpMagazine();
  fs.writeFileSync(path.join(root, MAGAZINE_INDEX_FILE), '[{"page":101,');
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), '{not json');
  assert.deepStrictEqual(loadIndex(root), []);
  assert.deepStrictEqual(loadFront(root), []);
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

export async function frontPageIsExactlyTheEditorsIdsInOrder(): Promise<void> {
  const root = tmpMagazine();
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(['b', 7, 'a']));
  putStories(root, story('a', 'A', ''), story('b', 'B', ''));
  assert.deepStrictEqual(loadFront(root), ['b', 'a']);
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

function withIndex(ids: string[], front: unknown): string {
  const root = tmpMagazine();
  fs.writeFileSync(path.join(root, MAGAZINE_INDEX_FILE), JSON.stringify(ids.map((id, i) => entry(100 + i, id, `Story ${id}`))));
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(front));
  putStories(root, ...ids.map((id) => story(id, `Story ${id}`, '')));
  return root;
}
const frontOf = (root: string): string[] => JSON.parse(fs.readFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), 'utf8'));

export async function onlyTheFullSysopMayEditTheFrontPage(): Promise<void> {
  assert.strictEqual(isSysopCaller({ user: { secLevel: 255 } }), true);
  assert.strictEqual(isSysopCaller({ user: { secLevel: 254 } }), false);
  assert.strictEqual(isSysopCaller({ user: null }), false);
  assert.strictEqual(isSysopCaller({}), false);
}

export async function frontEditsToggleMoveAndLeadAndKeepAPlainDeduplicatedArray(): Promise<void> {
  assert.deepStrictEqual(frontToggle(['a', 'b'], 'c'), ['a', 'b', 'c']);
  assert.deepStrictEqual(frontToggle(['a', 'b'], 'a'), ['b']);
  assert.deepStrictEqual(frontMove(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepStrictEqual(frontMove(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(frontLead(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepStrictEqual(frontLead(['a'], 'zz'), ['a']);
}

export async function writingTheFrontPageDropsUnknownIdsAndDuplicatesAndLeavesValidJson(): Promise<void> {
  const root = withIndex(['a', 'b', 'c'], ['a', 'gone', 'b', 'a']);
  const next = editFront((ids) => [...ids, 'c', 'b', 'also-gone'], root);
  assert.deepStrictEqual(next, ['a', 'b', 'c']);
  assert.deepStrictEqual(frontOf(root), ['a', 'b', 'c']);
  assert.deepStrictEqual(fs.readdirSync(root).filter((f) => f.includes('.tmp')), [], 'no temp file left behind');
}

export async function aFailedWriteLeavesTheOldFrontPageWhole(): Promise<void> {
  const root = withIndex(['a', 'b'], ['a']);
  const cjs = require('fs') as typeof fs;
  const real = cjs.renameSync;
  (cjs as any).renameSync = () => { throw new Error('disk full'); };
  try {
    assert.throws(() => writeFront(['a', 'b'], root), /disk full/);
  } finally { (cjs as any).renameSync = real; }
  assert.deepStrictEqual(frontOf(root), ['a'], 'the old file is untouched');
  assert.deepStrictEqual(fs.readdirSync(root).filter((f) => f.includes('.tmp')), []);
}

export async function theFrontPageIsReReadBeforeEveryWriteSoAnotherSysopsEditSurvives(): Promise<void> {
  const root = withIndex(['a', 'b', 'c'], ['a']);
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(['a', 'b']));
  assert.deepStrictEqual(editFront((ids) => frontToggle(ids, 'c'), root), ['a', 'b', 'c']);
}

export async function anEditThatChangesNothingWritesNothing(): Promise<void> {
  const root = withIndex(['a', 'b'], ['a', 'b']);
  const cjs = require('fs') as typeof fs;
  const real = cjs.renameSync;
  let calls = 0;
  (cjs as any).renameSync = (...args: Parameters<typeof fs.renameSync>) => { calls += 1; return real(...args); };
  try { editFront((ids) => frontMove(ids, 'a', -1), root); } finally { (cjs as any).renameSync = real; }
  assert.strictEqual(calls, 0);
}

const TEASER_ONLY = (id: string, headline: string, date = '2026-10-13'): Story =>
  story(id, headline, 'A short teaser.', { origin: 'feed', date });

export async function theIndexTheFrontPageAndSearchHideEveryStoryThatIsNotAnArticle(): Promise<void> {
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
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(['tea1', 'art1', 'gone', 'long']));
  const before = fs.readFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), 'utf8');
  assert.deepStrictEqual(loadIndex(root).map((e) => e.storyId), ['art1', 'long']);
  assert.deepStrictEqual(loadFront(root), ['art1', 'long'], 'a non-article id is skipped on display');
  assert.strictEqual(fs.readFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), 'utf8'), before, 'and the sysop\'s file is not rewritten by a read');
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
