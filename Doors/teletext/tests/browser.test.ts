/**
 * The door driven through its real key handler.
 *
 * These run against the demo pack installed in Teletext/, through the same
 * library, store and renderer a caller gets - not a stub. A test that only
 * checked the SDK would prove the page graph works and say nothing about
 * whether pressing R follows the red link.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TeletextApp, type DoorSession } from '../app';

/**
 * A board holding exactly the demo pack and nothing else.
 *
 * These used to read the live Teletext directory, and passed only for as
 * long as the demo pack was the only one installed - the day a real Ceefax
 * recovery was imported, half of them broke. A test owns its own board.
 */
const DEMO = path.join(__dirname, '..', '..', '..', 'Teletext', 'uprough-demo');

function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-door-test-'));
  fs.cpSync(DEMO, path.join(root, 'uprough-demo'), { recursive: true });
  return root;
}

class FakeTerminal {
  readonly chunks: string[] = [];
  closed = false;

  session(teletextMode = false, screenWidth = 40): DoorSession {
    return {
      socket: {
        emit: (_event: string, data?: unknown) => {
          if (typeof data === 'string') this.chunks.push(data);
        },
        on: () => {},
        off: () => {},
      },
      bbsSession: { texttvMode: teletextMode, screenHeight: 25, screenWidth },
      user: { username: 'tester' },
      close: () => { this.closed = true; },
    };
  }

  /** Everything written since the last clear, without the escape codes. */
  get text(): string {
    return this.chunks
      .join('')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b#[0-9]/g, '')
      .replace(/\x1b\[\?25[lh]/g, '');
  }

  get raw(): string {
    return this.chunks.join('');
  }

  /**
   * The last status bar written, without its escape codes.
   *
   * Every digit of a typed page number repaints the bar, so the bar the
   * caller is actually looking at is the last one - asserting over the whole
   * transcript matches the bars painted on the way there.
   */
  get bar(): string {
    const marker = '\x1b[25;1H';
    for (let at = this.chunks.length - 1; at >= 0; at--) {
      const chunk = this.chunks[at];
      const from = chunk.lastIndexOf(marker);
      if (from === -1) continue;
      return chunk
        .slice(from)
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        .trim();
    }
    return '';
  }

  forget(): void {
    this.chunks.length = 0;
  }
}

function open(teletextMode = false, width = 40): { term: FakeTerminal; app: TeletextApp } {
  const term = new FakeTerminal();
  const app = new TeletextApp(term.session(teletextMode, width), board());
  app.start();
  return { term, app };
}

function type(app: TeletextApp, keys: string): void {
  for (const key of keys) app.handleInput(key);
}

export async function opensTheOnlyInstalledService(): Promise<void> {
  // One pack installed is not a list worth showing.
  const { term, app } = open();
  assert.ok(term.text.includes('UP ROUGH DEMO SERVICE'), term.text.slice(0, 200));
  app.stop();
}

export async function typedDigitsJumpToAPage(): Promise<void> {
  const { term, app } = open();
  term.forget();
  type(app, '103');
  assert.ok(term.text.includes('QUIZ'), 'typing 103 should open the quiz page');
  assert.ok(term.text.includes('Which BBS software'), term.text.slice(0, 200));
  app.stop();
}

export async function partialPageNumberShowsInTheBar(): Promise<void> {
  const { term, app } = open();
  term.forget();
  type(app, '10');
  assert.ok(term.text.includes('P10_'), 'the header counter should show the digits so far');
  app.stop();
}

export async function redFollowsTheFastextLink(): Promise<void> {
  // This is the whole point of the door: a teletext game is a page graph,
  // and pressing a coloured key is how it is played.
  const { term, app } = open();
  type(app, '103');
  term.forget();
  type(app, 'r');
  assert.ok(term.text.includes('CORRECT'), 'red on the quiz page answers AMIEXPRESS');
  app.stop();
}

export async function greenFollowsTheWrongAnswer(): Promise<void> {
  const { term, app } = open();
  type(app, '103');
  term.forget();
  type(app, 'g');
  assert.ok(term.text.includes('WRONG'), 'green on the quiz page is CNET');
  app.stop();
}

export async function aMissingLinkSaysSoAndStays(): Promise<void> {
  // The wrong-answer page offers RED only. Its other three slots carry the
  // 0x8FF sentinel packet 27 writes into an unused link, which must read as
  // no link rather than as a trip to the filler page.
  const { term, app } = open();
  type(app, '106');
  term.forget();
  type(app, 'y');
  assert.ok(/no yellow link/.test(term.bar), term.bar);
  assert.ok(
    !/CORRECT|QUIZ|UP ROUGH/.test(term.text),
    'a key with no link behind it must not move the caller anywhere',
  );
  app.stop();
}

export async function anOfferedLinkIsAdvertisedAndAnEmptyOneIsNot(): Promise<void> {
  const { term, app } = open();
  type(app, '106');
  assert.ok(/\bR\b/.test(term.bar), `expected the red key in the bar: ${term.bar}`);
  assert.ok(!/RGYC/.test(term.bar), `the three empty slots must not be advertised: ${term.bar}`);

  // ...whereas the index page really does offer all four.
  type(app, 'h');
  assert.ok(/RGYC/.test(term.bar), `expected four keys on the index: ${term.bar}`);
  app.stop();
}

export async function revealUncoversTheAnswer(): Promise<void> {
  // AMIEXPRESS is on the page twice: once as the red answer option, once as
  // the concealed solution. Counting is the assertion - presence is not,
  // because the option is always visible.
  const occurrences = (text: string) => text.split('AMIEXPRESS').length - 1;

  const { term, app } = open();
  term.forget();
  type(app, '103');
  assert.strictEqual(occurrences(term.text), 1, 'the answer starts concealed');

  term.forget();
  type(app, 'v');
  assert.strictEqual(occurrences(term.text), 2, 'V reveals it');

  term.forget();
  type(app, 'v');
  assert.strictEqual(occurrences(term.text), 1, 'V again conceals it');
  app.stop();
}

export async function aPageTheRecoveryLacksIsReported(): Promise<void> {
  const { term, app } = open();
  term.forget();
  type(app, '899');
  assert.ok(/PAGE NOT FOUND/.test(term.text), term.text.slice(-120));
  app.stop();
}

export async function subpagesStepAndHold(): Promise<void> {
  const { term, app } = open();
  term.forget();
  type(app, '102');
  assert.ok(term.text.includes('SUBPAGE 1 OF 2'), 'the carousel opens on the first subpage');
  term.forget();
  type(app, '>');
  assert.ok(term.text.includes('SUBPAGE 2 OF 2'), '> steps the carousel');
  assert.ok(term.text.includes('HELD'), 'stepping by hand holds it');
  app.stop();
}

export async function arrowKeysStepThroughHeldPages(): Promise<void> {
  const { term, app } = open();
  type(app, '100');
  term.forget();
  app.handleInput('\x1b[C');
  assert.ok(term.text.includes('P101'), 'right arrow is the next page the pack holds');
  app.stop();
}

export async function arrowKeysArriveOneByteAtATime(): Promise<void> {
  // A terminal is free to split ESC [ C across three chunks, and a lone ESC
  // must not be mistaken for "leave".
  const { term, app } = open();
  type(app, '100');
  term.forget();
  app.handleInput('\x1b');
  app.handleInput('[');
  app.handleInput('C');
  assert.ok(term.text.includes('P101'), 'a split arrow sequence still steps the page');
  app.stop();
}

export async function homeReturnsToTheIndex(): Promise<void> {
  const { term, app } = open();
  type(app, '104');
  term.forget();
  type(app, 'h');
  assert.ok(term.text.includes('UP ROUGH DEMO SERVICE'), 'H goes back to the home page');
  app.stop();
}

export async function quitClosesTheDoor(): Promise<void> {
  const term = new FakeTerminal();
  const app = new TeletextApp(term.session(), board());
  app.start();
  type(app, 'q');
  assert.strictEqual(term.closed, true, 'Q closes the door');
}

export async function teletextSessionsGetDoubleHeightEscapes(): Promise<void> {
  // The board's terminal filter turns these into the font's baked halves.
  // An ANSI caller must never see them, or they print as stray glyphs.
  const teletext = new FakeTerminal();
  new TeletextApp(teletext.session(true), board()).start();
  assert.ok(teletext.raw.includes('\x1b#3'), 'a teletext session gets DECDHL');
  assert.ok(teletext.raw.includes('\x1b#4'), 'and its bottom half');

  const ansi = new FakeTerminal();
  new TeletextApp(ansi.session(false), board()).start();
  assert.ok(!ansi.raw.includes('\x1b#'), 'an ANSI session never does');
}

export async function ansiSessionsGetAsciiBlockGraphics(): Promise<void> {
  const ansi = new FakeTerminal();
  const app = new TeletextApp(ansi.session(false), board());
  app.start();
  type(app, '104');
  assert.ok(!/[\u{1FB00}-\u{1FB3B}]/u.test(ansi.raw), 'no sextants where the font has none');

  const teletext = new FakeTerminal();
  const tt = new TeletextApp(teletext.session(true), board());
  tt.start();
  type(tt, '104');
  assert.ok(/[\u{1FB00}-\u{1FB3B}]|█/u.test(teletext.raw), 'real sextants in teletext mode');
  tt.stop();
  app.stop();
}

// --- Page entry and the fake carousel search (SDK page-search) -----------

const COUNTER = /\x1b\[1;1H\x1b\[0;1;37;44m(.{16})\x1b\[0m/g;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** What the header counter said, in order. */
function counters(term: FakeTerminal): string[] {
  return [...term.raw.matchAll(COUNTER)].map(m => m[1].trim());
}

export async function typingAPageNumberShowsItInTheHeaderRollsTheCounterThenOpensThePage(): Promise<void> {
  const { term, app } = open(false, 80);
  term.forget();
  type(app, '103');
  assert.deepStrictEqual(counters(term), ['P1__', 'P10_', 'P103'], 'the number as it is typed');
  assert.ok(!term.text.includes('Which BBS software'), 'the page has not loaded yet');

  await sleep(1700);
  const shown = counters(term);
  assert.deepStrictEqual(shown.slice(0, 3), ['P1__', 'P10_', 'P103']);
  const rolled = shown.slice(3);
  assert.ok(rolled.length >= 2, `the counter rolled: ${JSON.stringify(shown)}`);
  assert.strictEqual(rolled[rolled.length - 1], 'P103', 'and stopped on the page');
  assert.ok(rolled.every((c, i) => i === 0 || parseInt(c.slice(1), 16) > parseInt(rolled[i - 1].slice(1), 16)));
  assert.ok(term.text.includes('Which BBS software'), 'then the page appeared');
  app.stop();
}

export async function anyKeySkipsTheSearchAndIsNotAlsoAHold(): Promise<void> {
  const { term, app } = open(false, 80);
  term.forget();
  type(app, '103');
  type(app, ' '); // the hold key, taken by the skip
  assert.ok(term.text.includes('Which BBS software'), 'the page appeared at once');
  assert.ok(!term.bar.includes('HELD'));
  await sleep(120);
  const after = counters(term).length;
  await sleep(200);
  assert.strictEqual(counters(term).length, after, 'no tick after the skip');
  app.stop();
}

export async function aSearchTickRepaintsTheCounterAloneAndCostsAFewBytes(): Promise<void> {
  const { term, app } = open(false, 80);
  type(app, '106');
  const base = term.chunks.length;
  await sleep(1700);
  const ticks = term.chunks.slice(base).filter(chunk => /^\x1b\[1;1H\x1b\[0;1;37;44m/.test(chunk));
  assert.ok(ticks.length >= 3, `ticks: ${ticks.length}`);
  for (const tick of ticks) {
    assert.ok(tick.length <= 40, `a tick is ${tick.length} bytes`);
    assert.strictEqual(tick.match(/\x1b\[\d+;\d+H/g)?.length, 1, 'one cursor move: one row');
  }
  process.stderr.write(`[TELETEXT] page-search tick: ${ticks[0].length} bytes, ${ticks.length} ticks\n`);
  app.stop();
}

export async function escapeCancelsAPageNumberAndPutsTheHeaderBack(): Promise<void> {
  const { term, app } = open(false, 80);
  type(app, '10');
  term.forget();
  app.handleInput('\x1b');
  await sleep(120);
  assert.strictEqual(term.closed, false, 'Escape only cancelled the number');
  assert.ok(term.text.includes('UP ROUGH DEMO SERVICE'), 'the real header is back');
  app.stop();
}

export async function aPageSearchAtFortyColumnsShowsSearchingAndCreatesNoTimer(): Promise<void> {
  const { term, app } = open(false, 40);
  const realTimeout = global.setTimeout;
  let made = 0;
  (global as any).setTimeout = (...args: any[]) => { made += 1; return (realTimeout as any)(...args); };
  try {
    term.forget();
    type(app, '103');
    assert.strictEqual(made, 0, 'no timer was created');
    assert.ok(counters(term).includes('SEARCHING P103'), JSON.stringify(counters(term)));
    assert.ok(term.text.includes('Which BBS software'), 'the page loaded at once');
  } finally {
    global.setTimeout = realTimeout;
    app.stop();
  }
}

export async function leavingTheDoorMidSearchClearsTheTimer(): Promise<void> {
  const { term, app } = open(false, 80);
  type(app, '106');
  app.stop();
  term.forget();
  await sleep(300);
  assert.strictEqual(term.chunks.length, 0, 'nothing is painted after the door has gone');
}
