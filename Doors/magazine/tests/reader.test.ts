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
  ARTICLE_MIN_BODY_CHARS,
  isArticle,
  type Desk,
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { BOOKMARK_KEY, READ_KEY, startReader, type Reader } from '../app';

const LONG = ('The Amiga demoscene has a new release this week. It runs on a stock A500 with half a megabyte, '
  + 'and the group says the copper bars are the cleanest they have shipped in years.\n\n'
  + 'A second paragraph explains how the music was composed in a tracker and ported to the player. ').repeat(6);

function story(id: string, headline: string, desk: Desk, date: string, summary = LONG, origin: 'feed' | 'authored' = 'authored'): Story {
  return {
    id, headline, summary, format: 'NEWS', desk, date, source: 'example.org', url: `https://example.org/${id}`,
    firstSeen: date, seenCount: 1, origin,
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
  const pages: Record<string, number> = { aaaa0001: 201, aaaa0002: 120, aaaa0003: 401, aaaa0004: 121, ffff0001: 122, ffff0002: 123 };
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
    assert.ok(h.reader.tickerRow().includes('EXAMPLE.ORG // '), `a static headline: "${h.reader.tickerRow()}"`);
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
      // At 40 the static headline changes with the page, so its row is the one extra.
      const wire = layout.effects ? -1 : (layout.tickerRow ?? -2) + 1;
      for (const row of touched) {
        assert.ok((row >= first && row <= last) || row === wire, `${w}: row ${row} is outside the panel (${first}..${last})`);
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

// ---------------------------------------------------------------------------
// The news wire: one row above the footer, repainted alone
// ---------------------------------------------------------------------------

/** Run `fn` with setInterval/clearInterval spied; hands back what the reader started and stopped. */
async function withTimers<T>(fn: (t: {
  started: Array<{ ms: number; cb: () => void; handle: any }>;
  cleared: any[];
}) => Promise<T>): Promise<T> {
  const started: Array<{ ms: number; cb: () => void; handle: any }> = [];
  const cleared: any[] = [];
  const realSet = global.setInterval;
  const realClear = global.clearInterval;
  (global as any).setInterval = (cb: () => void, ms?: number, ...rest: unknown[]) => {
    const handle = (realSet as any)(() => { /* the test drives ticks by hand */ }, 3600_000, ...rest);
    started.push({ ms: Number(ms), cb, handle });
    return handle;
  };
  (global as any).clearInterval = (handle: any) => { cleared.push(handle); return (realClear as any)(handle); };
  try { return await fn({ started, cleared }); } finally {
    global.setInterval = realSet;
    global.clearInterval = realClear;
  }
}

const TICKER_MS = 125;

export async function theNewsWireIsTheRowAboveTheFooterAt80And132(): Promise<void> {
  for (const [w, hgt] of [[80, 24], [132, 40]] as const) {
    const b = board([]);
    await withTimers(async () => {
      const h = await open(w, hgt);
      try {
        const l = h.reader.layout;
        assert.strictEqual(l.tickerRow, l.footerRow - 1, `${w}: directly above the footer`);
        assert.strictEqual(l.progressRow, l.tickerRow - 1, `${w}: progress sits above the wire`);
        assert.strictEqual(l.panelTop, 1, `${w}: the header carries no ticker`);
        for (const key of ['f', 'c', 'enter', 'k', '/']) {
          if (key === '/') continue;
          h.reader.press(key, key.length === 1 ? key : undefined);
          assert.ok(h.reader.tickerRow().startsWith(' ') || h.reader.tickerRow().length > 0, `${w}: wire shown in ${h.reader.viewKind()}`);
        }
        // The wire is on the glass at that row: the last write of its first frame addresses it.
        const painted = h.writes.join('');
        assert.ok(painted.includes(`\x1b[${l.tickerRow + 1};`), `${w}: bytes address row ${l.tickerRow + 1}`);
        assert.ok(h.reader.tickerRow().includes('EXAMPLE.ORG // Copper Lights lands'), `${w}: newest first: "${h.reader.tickerRow()}"`);
      } finally { await finish(h, b); }
    });
  }
}

export async function atFortyNoTimerIsCreatedAndOneStaticHeadlineChangesOnEachPageTurnOrViewChange(): Promise<void> {
  const b = board([]);
  await withTimers(async ({ started }) => {
    const h = await open(40, 25);
    try {
      assert.strictEqual(started.filter((s) => s.ms === TICKER_MS).length, 0, 'no ticker timer at 40');
      assert.strictEqual(h.reader.stats().intervals, 0);
      const l = h.reader.layout;
      assert.strictEqual(l.tickerRow, l.footerRow - 1);
      const seen: string[] = [h.reader.tickerRow()];
      h.reader.press('c', 'c');
      seen.push(h.reader.tickerRow());
      h.reader.press('enter');
      seen.push(h.reader.tickerRow());
      h.reader.press('space');
      seen.push(h.reader.tickerRow());
      for (let i = 1; i < seen.length; i++) assert.notStrictEqual(seen[i], seen[i - 1], `headline ${i} differs from the last`);
      for (const line of seen) assert.ok(line.length <= 40 && line.includes(' // '), `"${line}"`);
      // A cursor move is not a page turn: the wire holds still and costs nothing extra.
      h.reader.press('escape');
      const held = h.reader.tickerRow();
      h.reader.press('down');
      assert.strictEqual(h.reader.tickerRow(), held);
      assert.strictEqual(started.filter((s) => s.ms === TICKER_MS).length, 0, 'still no timer');
    } finally { await finish(h, b); }
  });
}

export async function oneTickRepaintsTheNewsWireRowAndNothingElse(): Promise<void> {
  for (const [w, hgt] of [[80, 24], [132, 40]] as const) {
    const b = board([]);
    await withTimers(async ({ started }) => {
      const h = await open(w, hgt);
      try {
        h.reader.press('c', 'c');
        h.reader.press('down');
        await new Promise((resolve) => setImmediate(resolve));
        const timers = started.filter((s) => s.ms === TICKER_MS);
        assert.strictEqual(timers.length, 1, `${w}: exactly one ticker timer`);
        const tick = timers[0].cb;
        const bodyBefore = h.reader.panelRows();
        const progressBefore = h.reader.progressRow();
        const wireBefore = h.reader.tickerRow();
        h.mark();
        tick();
        const rows = [...h.rowsTouched()];
        assert.deepStrictEqual(rows, [h.reader.layout.tickerRow + 1], `${w}: only the wire row is addressed`);
        assert.notStrictEqual(h.reader.tickerRow(), wireBefore, `${w}: the wire moved`);
        assert.strictEqual(h.reader.stats().tickerSteps, 1);
        assert.deepStrictEqual(h.reader.panelRows(), bodyBefore, `${w}: body untouched`);
        assert.strictEqual(h.reader.progressRow(), progressBefore);
        assert.strictEqual(h.reader.viewKind(), 'contents');
        // The selection still acts: Enter opens the story the cursor was on.
        // (a full repaint path would also reset it through build()).
        const perFrame = h.bytes();
        // eslint-disable-next-line no-console
        console.log(`    ticker ${w}x${hgt}: ${perFrame} bytes/frame, ${perFrame * 8} bytes/s at 8 cells/s`);
        assert.ok(perFrame < w * 3, `${w}: a frame cost ${perFrame} bytes`);
        // Ten more ticks: still one row, never a growing cost.
        h.mark();
        for (let i = 0; i < 10; i++) tick();
        assert.deepStrictEqual([...h.rowsTouched()], [h.reader.layout.tickerRow + 1]);
      } finally { await finish(h, b); }
    });
  }
}

export async function theNewsWireTimerIsClearedOnExitAndDoesNotKeepTheDoorAlive(): Promise<void> {
  const b = board([]);
  await withTimers(async ({ started, cleared }) => {
    const h = await open(80, 24);
    const timers = started.filter((s) => s.ms === TICKER_MS);
    assert.strictEqual(timers.length, 1);
    assert.strictEqual(timers[0].handle.hasRef(), false, 'unref()ed: the marquee cannot hold the process open');
    assert.ok(!cleared.includes(timers[0].handle));
    h.reader.press('q', 'q');
    await h.reader.done;
    assert.ok(cleared.includes(timers[0].handle), 'clearInterval ran on exit');
    b.restore();
  });
}

// ---------------------------------------------------------------------------
// Feed stories are wire, never articles (sysop 2026-10-13)
// ---------------------------------------------------------------------------

const TEASER = 'We rebuild a clock from relays and a lot of patience, with a second sentence that '
  + 'runs on well past any single column so the list line has to be cut at a word.';

const FEED: Story[] = [
  story('ffff0001', 'A relay clock from the junk drawer', 'hack', '2026-10-12', TEASER, 'feed'),
  story('ffff0002', 'Another feed headline about radios', 'hack', '2026-10-11', 'Short teaser.', 'feed'),
];
const MIXED: Story[] = [...FEED, STORIES[1]];

/** A key the way the terminal delivers it, through the screen's own key routing. */
function modalKey(h: Harness, name: string): void {
  (h.reader.screen as any)._handleKey('', { name, full: name, sequence: name });
}

export async function aFeedStoryIsAWireRowAndEnterOpensThePanelNotTheArticle(): Promise<void> {
  for (const [w, hgt] of [[40, 25], [80, 24], [132, 40]] as const) {
    const b = board([], MIXED);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      h.reader.press('down');
      const rows = h.reader.panelRows();
      const flat = rows.join('\n');
      const at = rows.findIndex((r) => r.includes('A relay clock'));
      assert.ok(at >= 0, `${w}: the feed headline is listed`);
      const teaserAt = rows.findIndex((r) => r.includes('We rebuild a clock'));
      assert.ok(teaserAt > at, `${w}: one teaser line under the headline`);
      assert.ok(rows[teaserAt].includes('..'), `${w}: cut at a word with a mark`);
      assert.ok(/EXAMPLE\.ORG \/\/ (TODAY|YESTERDAY|\dD AGO|\d{4}-\d\d-\d\d)/.test(rows[teaserAt + 1]), `${w}: SOURCE // age: "${rows[teaserAt + 1]}"`);
      assert.ok(!/https?:/.test(flat), `${w}: no raw url in the list`);
      for (const r of rows) assert.ok(r.length <= w, `${w}: row fits`);
      assert.ok(!flat.includes(TEASER.slice(60)), `${w}: the teaser is one line, not the whole text`);

      const before = h.reader.panelRows();
      h.reader.press('enter');
      assert.strictEqual(h.reader.viewKind(), 'contents', `${w}: Enter did not open the article`);
      const modal = h.reader.modalText();
      assert.ok(modal.includes(TEASER), `${w}: the panel holds the whole teaser`);
      assert.ok(modal.includes('Source: example.org'), `${w}: the panel names the site`);
      assert.ok(/Date: 2026-10-12/.test(modal), `${w}: and the date`);
      assert.ok(!/https?:|Read at source/.test(modal), `${w}: and no address`);
      assert.deepStrictEqual(overflowing(h.reader.screen, w), [], `${w}: the panel fits the screen`);

      modalKey(h, 'escape');
      assert.strictEqual(h.reader.modalText(), '', `${w}: Escape closes the panel`);
      assert.strictEqual(h.reader.viewKind(), 'contents');
      const after = h.reader.panelRows();
      assert.ok(after.some((r) => r.includes('>A relay clock')), `${w}: same cursor position`);
      assert.deepStrictEqual(after.map((r) => r.replace(/\S/g, 'x').length), before.map((r) => r.replace(/\S/g, 'x').length));
      h.reader.press('enter');
      assert.ok(h.reader.modalText().length > 0, `${w}: reopens`);
      modalKey(h, 'enter');
      assert.strictEqual(h.reader.modalText(), '', `${w}: Enter closes it too`);
    } finally { await finish(h, b); }
  }
}

export async function anAuthoredStoryStillOpensTheArticleAmongWireRows(): Promise<void> {
  for (const [w, hgt] of [[40, 25], [80, 24], [132, 40]] as const) {
    const b = board([], MIXED);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      assert.ok(h.reader.panelRows().some((r) => r.includes('>New exploit chain')), `${w}: cursor on the authored story`);
      h.reader.press('enter');
      assert.strictEqual(h.reader.viewKind(), 'article');
      assert.strictEqual(h.reader.modalText(), '');
      const t = h.reader.panelRows().join('\n');
      assert.ok(t.includes('NEW EXPLOIT CHAIN'), `${w}: article headline`);
      assert.ok(!/https?:/.test(t), `${w}: and no raw url`);
      if (w === 132) assert.strictEqual(h.reader.layout.geometry.cols, 3, 'authored stories keep the columns');
    } finally { await finish(h, b); }
  }
}

// ---------------------------------------------------------------------------
// A feed story with real full text is an article (sysop 2026-10-14)
// ---------------------------------------------------------------------------

/** Paragraphs of `body` text whose total length is exactly `length`. */
function bodyOf(length: number): string {
  const para = 'The relay chassis hums while the old contacts click through their sequence and the clock finds its second. ';
  const text = Array.from({ length: Math.ceil(length / para.length) }, (_, i) => `${para.trim()} Part ${i + 1}.`).join('\n\n');
  return text.slice(0, length).trimEnd().padEnd(length, '.');
}

function withBody(st: Story, length: number): Story {
  return { ...st, body: bodyOf(length) };
}

export async function theArticleThresholdSeparatesTheWireFromAnArticle(): Promise<void> {
  const feed = story('x', 'h', 'hack', '2026-10-12', 'Teaser.', 'feed');
  assert.strictEqual(isArticle(feed), false, 'a teaser is wire');
  assert.strictEqual(isArticle(withBody(feed, ARTICLE_MIN_BODY_CHARS - 1)), false, 'one character short is wire');
  assert.strictEqual(isArticle(withBody(feed, ARTICLE_MIN_BODY_CHARS)), true, 'the threshold is an article');
  assert.strictEqual(isArticle({ ...feed, origin: 'authored' }), true, 'authored is always an article');
}

export async function aFeedStoryWithFullTextOpensInColumnsAndIsTaggedArticle(): Promise<void> {
  const expectedCols: Record<number, number> = { 40: 1, 80: 2, 132: 3 };
  for (const [w, hgt] of [[40, 25], [80, 24], [132, 40]] as const) {
    const stories = [withBody(FEED[0], ARTICLE_MIN_BODY_CHARS + 800), FEED[1], STORIES[1]];
    const b = board([], stories);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      h.reader.press('down');
      const rows = h.reader.panelRows();
      const at = rows.findIndex((r) => r.includes('A relay clock'));
      assert.ok(at >= 0, `${w}: listed`);
      assert.ok(/ARTICLE \/\/ EXAMPLE\.ORG/.test(rows.join('\n')), `${w}: the full-text story is tagged ARTICLE`);
      assert.ok(!rows[at + 1].includes('We rebuild'), `${w}: and has no teaser line`);
      const wireAt = rows.findIndex((r) => r.includes('Another feed headline'));
      assert.ok(wireAt < 0 || /EXAMPLE\.ORG \/\/ (TODAY|YESTERDAY|\dD AGO|\d{4})/.test(rows.slice(wireAt).join('\n')), `${w}: the short one stays a wire row`);
      // Enter on the article story opens the article layout.
      h.reader.press('up');
      for (let i = 0; i < 6 && !h.reader.panelRows().some((r) => r.includes('>A relay clock')); i++) h.reader.press('down');
      assert.ok(h.reader.panelRows().some((r) => r.includes('>A relay clock')), `${w}: cursor on the full-text story`);
      h.reader.press('enter');
      assert.strictEqual(h.reader.viewKind(), 'article', `${w}: Enter opens the article, not the wire panel`);
      assert.strictEqual(h.reader.modalText(), '', `${w}: no wire panel`);
      assert.strictEqual(h.reader.layout.geometry.cols, expectedCols[w], `${w}: columns`);
      const t = h.reader.panelRows().join('\n');
      assert.ok(t.includes('A RELAY CLOCK'), `${w}: headline`);
      assert.ok(t.includes('relay chassis hums'), `${w}: body text, not the teaser`);
      assert.ok(!t.includes('We rebuild a clock'), `${w}: the teaser is replaced by the body`);
      let everything = t;
      for (let i = 0; i < 12; i++) { h.reader.press('down'); everything += `\n${h.reader.panelRows().join('\n')}`; }
      assert.ok(everything.includes('example.org') && !/https?:/.test(everything), `${w}: the site name, no address`);
      for (const r of h.reader.panelRows()) assert.ok(r.length <= w, `${w}: row fits`);
    } finally { await finish(h, b); }
  }
}

export async function aFeedStoryWithAShortBodyStillOpensTheWirePanel(): Promise<void> {
  for (const [w, hgt] of [[40, 25], [80, 24], [132, 40]] as const) {
    const b = board([], [withBody(FEED[0], ARTICLE_MIN_BODY_CHARS - 1), FEED[1], STORIES[1]]);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      h.reader.press('down');
      const rows = h.reader.panelRows();
      const at = rows.findIndex((r) => r.includes('A relay clock'));
      assert.ok(at >= 0 && !/ARTICLE \/\//.test(rows[at + 1] + (rows[at + 2] ?? '')), `${w}: not tagged`);
      h.reader.press('enter');
      assert.strictEqual(h.reader.viewKind(), 'contents', `${w}: stays on the list`);
      assert.ok(h.reader.modalText().includes(TEASER), `${w}: the wire panel opened`);
    } finally { await finish(h, b); }
  }
}

export async function aFeedStoryOnTheFrontPageAndInBookmarksIsAWireRowToo(): Promise<void> {
  const b = board(['ffff0001'], FEED);
  const h = await open(80, 24);
  try {
    assert.strictEqual(h.reader.viewKind(), 'front');
    const rows = h.reader.panelRows();
    assert.ok(/EXAMPLE\.ORG \/\//.test(rows.join('\n')));
    h.reader.press('enter');
    assert.strictEqual(h.reader.viewKind(), 'front');
    assert.ok(h.reader.modalText().includes(TEASER));
    modalKey(h, 'escape');
    h.reader.press('b', 'b');
    h.reader.press('k', 'k');
    assert.strictEqual(h.reader.viewKind(), 'bookmarks');
    assert.ok(/EXAMPLE\.ORG \/\//.test(h.reader.panelRows().join('\n')));
  } finally { await finish(h, b); }
}

export async function theWirePanelOpenAndCloseCostIsMeasuredAndSmallerThanTheScreen(): Promise<void> {
  for (const [w, hgt] of [[80, 24], [40, 25]] as const) {
    const b = board([], FEED);
    const h = await open(w, hgt);
    try {
      h.reader.press('c', 'c');
      await new Promise((resolve) => setTimeout(resolve, 50));
      h.mark();
      h.reader.press('down');
      const move = h.bytes();
      h.mark();
      h.reader.press('enter');
      const open = h.bytes();
      h.mark();
      modalKey(h, 'escape');
      const close = h.bytes();
      assert.ok(move < 700, `${w}: wire-list cursor move ${move} bytes`);
      assert.ok(open < 1800 && close < 1800, `${w}: panel open ${open} / close ${close} bytes`);
      // eslint-disable-next-line no-console
      console.log(`    repaint ${w}x${hgt}: wire cursor move ${move} bytes, panel open ${open} bytes, close ${close} bytes`);
    } finally { await finish(h, b); }
  }
}
