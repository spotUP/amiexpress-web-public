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
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { loadFront, loadIndex, loadSnapshot, loadStory, paintSafe, searchStories, storiesPerDay } from '../library';

function tmpMagazine(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mag-lib-'));
}

const entry = (page: number, storyId: string, title: string, date = '2026-10-13'): MagazineIndexEntry => ({
  page, storyId, title, desk: 'hack', format: 'NEWS', date,
});

const story = (id: string, headline: string, summary: string): Story => ({
  id, headline, summary, format: 'NEWS', desk: 'hack', date: '2026-10-13', source: 'example.org',
  firstSeen: '2026-10-13', seenCount: 1,
});

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
  assert.deepStrictEqual(loadIndex(root).map((e) => e.page), [101, 120]);
}

export async function frontPageIsExactlyTheEditorsIdsInOrder(): Promise<void> {
  const root = tmpMagazine();
  fs.writeFileSync(path.join(root, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(['b', 7, 'a']));
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
