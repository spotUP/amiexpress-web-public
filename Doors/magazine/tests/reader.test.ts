/**
 * The reader driven on a REAL blessed screen, at the three geometries.
 *
 * A stub `bbs` answers `getTerminalSize()` and records every byte the screen
 * writes; the board root is a temp directory holding a fixture Magazine/. So
 * what is proven here is the door as a caller meets it: keys in, panel rows
 * and terminal bytes out.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import {
  MAGAZINE_DIR,
  MAGAZINE_FRONTPAGE_FILE,
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  type Desk,
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { BOOKMARK_KEY, READ_KEY, startReader, type Reader } from '../app';

const LONG = ('The Amiga demoscene has a new release this week. It runs on a stock A500 with half a megabyte, '
  + 'and the group says the copper bars are the cleanest they have shipped in years.\n\n'
  + 'A second paragraph explains how the music was composed in a tracker and ported to the player. ').repeat(6);

function story(id: string, headline: string, desk: Desk, date: string, summary = LONG): Story {
  return {
    id, headline, summary, format: 'NEWS', desk, date, source: 'example.org', url: `https://example.org/${id}`,
    firstSeen: date, seenCount: 1,
  };
}

const STORIES: Story[] = [
  story('aaaa0001', 'Copper Lights lands for the Amiga', 'scene', '2026-10-13'),
  story('aaaa0002', 'New exploit chain in a router firmware', 'hack', '2026-10-12'),
  story('aaaa0003', 'Tracker music from a lost cassette', 'music', '2026-10-12'),
  story('aaaa0004', 'Second hacking story about fuzzing', 'hack', '2026-10-11'),
];

interface Board {
  root: string;
  restore: () => void;
}

/** A board root with a Magazine/ in it. `approved` is the editor's front page. */
function board(approved: string[], stories: Story[] = STORIES): Board {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-board-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  const mag = path.join(root, MAGAZINE_DIR);
  fs.mkdirSync(path.join(mag, MAGAZINE_STORIES_DIR), { recursive: true });
  // The page numbers the tests rely on: the two hack stories sit on 120 and 121.
  const pages: Record<string, number> = { aaaa0001: 201, aaaa0002: 120, aaaa0003: 401, aaaa0004: 121 };
  const index: MagazineIndexEntry[] = stories.map((st) => ({
    page: pages[st.id], title: st.headline, desk: st.desk, format: st.format, storyId: st.id, date: st.date,
  }));
  fs.writeFileSync(path.join(mag, MAGAZINE_INDEX_FILE), JSON.stringify(index));
  fs.writeFileSync(path.join(mag, MAGAZINE_FRONTPAGE_FILE), JSON.stringify(approved));
  for (const st of stories) fs.writeFileSync(path.join(mag, MAGAZINE_STORIES_DIR, `${st.id}.json`), JSON.stringify(st));
  const before = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  return {
    root,
    restore: () => {
      if (before === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = before;
    },
  };
}

interface Harness {
  reader: Reader;
  writes: string[];
  storage: Map<string, unknown>;
  bytes: () => number;
  /** Rows (1-based) the terminal was told to move to, since `mark()`. */
  rowsTouched: () => Set<number>;
  mark: () => void;
}

async function open(width: number, height: number, options: { theme?: ReturnType<typeof themeById> } = {}): Promise<Harness> {
  const writes: string[] = [];
  const storage = new Map<string, unknown>();
  const theme = options.theme ?? themeById('uprough-neon');
  const bbs: any = {
    write: (d: string) => { writes.push(String(d)); },
    writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    getTheme: () => theme,
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: {}, socket, doorCommand: 'MAG' },
    storage: {
      load: async (k: string) => (storage.has(k) ? storage.get(k) : null),
      save: async (k: string, v: unknown) => { storage.set(k, v); },
    },
  };
  const reader = await startReader(session);
  await new Promise((resolve) => setImmediate(resolve));
  let from = writes.length;
  return {
    reader, writes, storage,
    mark: () => { from = writes.length; },
    bytes: () => writes.slice(from).join('').length,
    rowsTouched: () => {
      const rows = new Set<number>();
      for (const m of writes.slice(from).join('').matchAll(/\x1b\[(\d+);\d+H/g)) rows.add(Number(m[1]));
      return rows;
    },
  };
}

async function finish(h: Harness, b: Board): Promise<void> {
  h.reader.stop();
  b.restore();
}

const text = (h: Harness) => h.reader.panelRows().join('\n');

export async function frontPageWithNothingApprovedSaysAwaitingEditor(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    assert.strictEqual(h.reader.viewKind(), 'front');
    assert.ok(text(h).includes('AWAITING EDITOR'));
    for (const st of STORIES) assert.ok(!text(h).includes(st.headline), 'the reader never picks a front page itself');
  } finally { await finish(h, b); }
}

export async function frontPageIsExactlyTheEditorsStoriesInTheEditorsOrder(): Promise<void> {
  const b = board(['aaaa0003', 'aaaa0001']);
  const h = await open(80, 24);
  try {
    const t = text(h);
    assert.ok(!t.includes('AWAITING EDITOR'));
    assert.ok(t.indexOf('Tracker music') >= 0 && t.indexOf('Tracker music') < t.indexOf('Copper Lights'));
    assert.ok(!t.includes('router firmware'), 'an unapproved story is not on the front page');
  } finally { await finish(h, b); }
}

export async function aFrontPageIdThatIsNotPublishedIsSkippedNotShownAsABrokenRow(): Promise<void> {
  const b = board(['gone9999']);
  const h = await open(80, 24);
  try { assert.ok(text(h).includes('AWAITING EDITOR')); } finally { await finish(h, b); }
}

export async function contentsListsEverySectionWithPageNumbersAndEnterOpensTheStory(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('c', 'c');
    assert.strictEqual(h.reader.viewKind(), 'contents');
    const t = text(h);
    assert.ok(t.includes('HACKING & PHREAKING') && t.includes('SCENE & RETRO') && t.includes('MUSIC & RADIO'));
    assert.ok(/New exploit chain.*120/.test(t), 'page number on the entry row');
    h.reader.press('enter');
    assert.strictEqual(h.reader.viewKind(), 'article');
    assert.ok(text(h).includes('[ NEWS // HACK // 2026-10-12 ]'), 'the first listed story is the hack desk');
    assert.ok(text(h).includes('NEW EXPLOIT CHAIN'), 'the headline is set in capitals');
    assert.deepStrictEqual(h.storage.get(READ_KEY), ['aaaa0002'], 'opening a story marks it read, by story id');
  } finally { await finish(h, b); }
}

export async function theCursorMovesWithTheArrowKeysAndEscapeReturnsToTheList(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('c', 'c');
    h.reader.press('down');
    h.reader.press('enter');
    assert.ok(text(h).includes('SECOND HACKING STORY'));
    h.reader.press('escape');
    assert.strictEqual(h.reader.viewKind(), 'contents');
    assert.ok(/>Second hacking story/.test(text(h)), 'the cursor is where the reader left it');
  } finally { await finish(h, b); }
}

export async function leavingFromTheTopLevelEndsTheDoor(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  let ended = false;
  h.reader.done.then(() => { ended = true; });
  h.reader.press('escape');
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(ended, true);
  b.restore();
}

export async function qQuitsFromAnywhere(): Promise<void> {
  const b = board([]);
  const h = await open(40, 25);
  let ended = false;
  h.reader.done.then(() => { ended = true; });
  h.reader.press('c', 'c');
  h.reader.press('enter');
  h.reader.press('q', 'q');
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(ended, true);
  b.restore();
}

export async function typingAPageNumberJumpsToThatStoryAndAnUnknownPageSaysSo(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('1', '1'); h.reader.press('2', '2'); h.reader.press('1', '1');
    assert.strictEqual(h.reader.viewKind(), 'article');
    assert.ok(text(h).includes('SECOND HACKING STORY'), 'page 121');
    h.reader.press('9', '9'); h.reader.press('9', '9'); h.reader.press('9', '9');
    assert.ok(text(h).includes('SECOND HACKING STORY'), 'an unknown page leaves the reader where it was');
  } finally { await finish(h, b); }
}

export async function sectionKeyCyclesThroughTheDesksThatHaveStories(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('c', 'c');
    h.reader.press('s', 's');
    let t = text(h);
    assert.ok(t.includes('CONTENTS - HACKING & PHREAKING'));
    assert.ok(!t.includes('SCENE & RETRO'), 'one section at a time');
    h.reader.press('s', 's');
    assert.ok(text(h).includes('CONTENTS - SCENE & RETRO'));
    for (let i = 0; i < 2; i++) h.reader.press('s', 's');
    t = text(h);
    assert.ok(t.includes('CONTENTS - ALL SECTIONS'), 'the cycle wraps back to everything');
  } finally { await finish(h, b); }
}

export async function bookmarksPersistByStoryIdAndShowInTheBookmarkList(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('c', 'c');
    h.reader.press('b', 'b');
    assert.deepStrictEqual(h.storage.get(BOOKMARK_KEY), ['aaaa0002']);
    assert.ok(/\* New exploit chain/.test(text(h)), 'a bookmarked entry is starred in the contents');
    h.reader.press('k', 'k');
    assert.strictEqual(h.reader.viewKind(), 'bookmarks');
    assert.ok(text(h).includes('New exploit chain'));
    h.reader.press('b', 'b');
    assert.deepStrictEqual(h.storage.get(BOOKMARK_KEY), []);
    h.reader.press('k', 'k');
    assert.ok(text(h).includes('NO BOOKMARKS YET'));
  } finally { await finish(h, b); }
}

export async function readAndBookmarkStateComesBackFromStorage(): Promise<void> {
  const b = board([]);
  const writes: string[] = [];
  const store = new Map<string, unknown>([[READ_KEY, ['aaaa0001']], [BOOKMARK_KEY, ['aaaa0003']]]);
  const bbs: any = {
    write: (d: string) => { writes.push(d); }, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 24 }), getTheme: () => themeById('uprough-neon'),
    enableWideMode: () => {}, disableWideMode: () => {}, getModemSpeed: () => 0,
    disableModemEmulation: () => {}, setModemSpeed: () => {}, connectionType: 'web', unicodeCapable: true,
  };
  const reader = await startReader({
    bbs,
    storage: { load: async (k: string) => (store.get(k) as never) ?? null, save: async () => {} },
  } as never);
  try {
    reader.press('c', 'c');
    const t = reader.panelRows().join('\n');
    assert.ok(/\* Tracker music/.test(t), 'bookmark remembered across visits');
  } finally { reader.stop(); b.restore(); }
}

export async function aMagazineThatDisappearsMidVisitDegradesToANoticeNotACrash(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    fs.rmSync(path.join(b.root, MAGAZINE_DIR), { recursive: true, force: true });
    h.reader.press('c', 'c');
    assert.ok(text(h).includes('NO STORIES YET'));
    h.reader.press('f', 'f');
    assert.ok(text(h).includes('AWAITING EDITOR'));
  } finally { await finish(h, b); }
}

export async function aStoryThatLeftTheArchiveShowsANotice(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.press('c', 'c');
    fs.rmSync(path.join(b.root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR, 'aaaa0002.json'));
    h.reader.press('enter');
    assert.ok(text(h).includes('STORY NOT FOUND'));
  } finally { await finish(h, b); }
}

export async function aRealKeypressOnTheScreenReachesTheReader(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    h.reader.screen.emit('keypress', 'c', { name: 'c', full: 'c', sequence: 'c' });
    assert.strictEqual(h.reader.viewKind(), 'contents', 'screen keypress -> press()');
  } finally { await finish(h, b); }
}

// ---------------------------------------------------------------------------
// Three screens
// ---------------------------------------------------------------------------

function overflowing(screen: any, cols: number): string[] {
  const out: string[] = [];
  const walk = (el: any, p: string) => {
    for (const child of el.children ?? []) {
      if (child.hidden) continue;
      const pos = child._getCoords?.();
      const name = `${p}/${child.constructor.name}`;
      if (pos && pos.xl > cols) out.push(`${name} ends at ${pos.xl}`);
      walk(child, name);
    }
  };
  walk(screen, '');
  return out;
}

export async function atFortyByTwentyFiveEveryRowFitsOneColumnAndNothingMoves(): Promise<void> {
  const b = board(['aaaa0001']);
  const h = await open(40, 25);
  try {
    assert.strictEqual(h.reader.screen.width, 40);
    assert.strictEqual(h.reader.layout.geometry.cols, 1);
    assert.deepStrictEqual(overflowing(h.reader.screen, 40), []);
    for (const key of ['f', 'c', 'enter']) {
      h.reader.press(key, key.length === 1 ? key : undefined);
      for (const row of h.reader.panelRows()) assert.ok(row.length <= 40, `"${row}" is ${row.length} wide`);
    }
    const afterOpen = h.reader.stats();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const later = h.reader.stats();
    assert.deepStrictEqual(later, { glitches: 0, tickerSteps: 0, intervals: 0 }, 'no effect runs at 40');
    assert.deepStrictEqual(afterOpen, later);
  } finally { await finish(h, b); }
}

export async function atEightyTheTickerRunsAndTheHeadlineGlitchesOnceThenHoldsStill(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24);
  try {
    assert.ok(h.reader.layout.tickerRow !== null);
    h.reader.press('c', 'c');
    h.reader.press('enter');
    const opened = text(h);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const stats = h.reader.stats();
    assert.strictEqual(stats.glitches, 1, 'exactly one glitch per article open');
    assert.ok(stats.intervals >= 1, 'the ticker timer exists');
    assert.strictEqual(text(h), opened, 'the headline is back to the truth after the glitch');
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.strictEqual(h.reader.stats().glitches, 1, 'and it does not glitch again by itself');
  } finally { await finish(h, b); }
}

export async function aThemeWithoutGlitchesNeverGlitchesTheHeadline(): Promise<void> {
  const b = board([]);
  const h = await open(80, 24, { theme: themeById('classic') });
  try {
    h.reader.press('c', 'c');
    h.reader.press('enter');
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.strictEqual(h.reader.stats().glitches, 0);
  } finally { await finish(h, b); }
}

export async function theSysopCanSwitchTheTickerOffWithTheSetting(): Promise<void> {
  const file = path.join(__dirname, '..', 'settings.json');
  const existed = fs.existsSync(file);
  assert.ok(!existed, 'the test owns settings.json for its duration');
  fs.writeFileSync(file, JSON.stringify({ show_ticker: false }));
  const b = board([]);
  try {
    const h = await open(80, 24);
    try {
      assert.strictEqual(h.reader.layout.tickerRow, null);
      assert.strictEqual(h.reader.layout.panelTop, 1);
      assert.strictEqual(h.reader.stats().intervals, 0);
    } finally { h.reader.stop(); }
  } finally { fs.rmSync(file, { force: true }); b.restore(); }
}

export async function atOneThirtyTwoTheArticleIsSetInThreeColumns(): Promise<void> {
  const b = board([]);
  const h = await open(132, 40);
  try {
    h.reader.press('c', 'c');
    h.reader.press('enter');
    const body = h.reader.panelRows()[6];
    assert.strictEqual((body.match(/│/g) ?? []).length, 2, `three columns: "${body}"`);
    assert.deepStrictEqual(overflowing(h.reader.screen, 132), []);
  } finally { await finish(h, b); }
}

// ---------------------------------------------------------------------------
// Repaint cost: a page turn is the panel, never the screen
// ---------------------------------------------------------------------------

export async function aPageTurnTouchesOnlyThePanelAndTheProgressRow(): Promise<void> {
  for (const [w, hgt] of [[80, 24], [40, 25]] as const) {
    const b = board([]);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      h.reader.press('enter');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const layout = h.reader.layout;
      h.mark();
      h.reader.press('space');
      const touched = [...h.rowsTouched()];
      const first = layout.panelTop + 1;
      const last = layout.progressRow + 1;
      assert.ok(touched.length > 0, `${w}: the page turn painted something`);
      for (const row of touched) {
        assert.ok(row >= first && row <= last, `${w}: row ${row} is outside the panel (${first}..${last})`);
      }
      // The numbers the handoff records.
      // eslint-disable-next-line no-console
      console.log(`    repaint ${w}x${hgt}: page turn ${h.bytes()} bytes, rows ${Math.min(...touched)}..${Math.max(...touched)}`);
    } finally { await finish(h, b); }
  }
}

export async function aCursorMoveInAListRepaintsTwoEntriesNotThePanel(): Promise<void> {
  for (const [w, hgt] of [[80, 24], [40, 25]] as const) {
    const b = board([]);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      await new Promise((resolve) => setTimeout(resolve, 50));
      h.mark();
      h.reader.press('down');
      const bytes = h.bytes();
      assert.ok(bytes > 0, `${w}: the cursor moved on screen`);
      assert.ok(bytes < 700, `${w}: a cursor move cost ${bytes} bytes`);
      // eslint-disable-next-line no-console
      console.log(`    repaint ${w}x${hgt}: cursor move ${bytes} bytes`);
    } finally { await finish(h, b); }
  }
}

// ---------------------------------------------------------------------------
// Footer and progress: fit the screen at every tier
// ---------------------------------------------------------------------------

export async function theFooterFitsTheScreenAndEndsOnAWholeHintAtEveryTier(): Promise<void> {
  for (const [w, hgt] of [[40, 25], [80, 25], [132, 40]] as const) {
    const b = board([]);
    const h = await open(w, hgt);
    try {
      const footer = h.reader.footerRow().trimEnd();
      assert.ok(footer.length <= w, `${w}: footer is ${footer.length} wide: "${footer}"`);
      assert.ok(footer.includes('?: Help') && footer.includes('Q: Quit'), `${w}: Help and Quit stay: "${footer}"`);
      // Every hint is whole: each "K:" cap is followed by its full word.
      const words = ['Page', 'Contents', 'Front', 'Section', 'Bookmark', 'Search', 'Help', 'Quit'];
      for (const m of footer.matchAll(/(\S+): (\S+)/g)) {
        assert.ok(words.includes(m[2]), `${w}: cut hint "${m[0]}" in "${footer}"`);
      }
      if (w === 80) assert.ok(!footer.endsWith(':'), `80: "${footer}"`);
    } finally { await finish(h, b); }
  }
}

export async function aMultiSpreadArticleShowsItsPageCounterAndAShortOneToo(): Promise<void> {
  const b = board([]);
  const h = await open(80, 25);
  try {
    h.reader.press('c', 'c');
    h.reader.press('enter');
    assert.ok(/Page 1 of \d+$/.test(h.reader.progressRow()), `"${h.reader.progressRow()}"`);
    assert.ok(Number(h.reader.progressRow().match(/of (\d+)$/)![1]) > 1, 'the long story has several spreads');
    h.reader.press('space');
    assert.ok(/Page 2 of \d+$/.test(h.reader.progressRow()));
  } finally { await finish(h, b); }
}
