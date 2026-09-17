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

  session(teletextMode = false): DoorSession {
    return {
      socket: {
        emit: (_event: string, data?: unknown) => {
          if (typeof data === 'string') this.chunks.push(data);
        },
        on: () => {},
        off: () => {},
      },
      bbsSession: { texttvMode: teletextMode, screenHeight: 25 },
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

function open(teletextMode = false): { term: FakeTerminal; app: TeletextApp } {
  const term = new FakeTerminal();
  const app = new TeletextApp(term.session(teletextMode), board());
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
  assert.ok(term.text.includes('P10_'), 'the bar should show the digits so far');
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
  assert.ok(/is not in this recovery/.test(term.text), term.text.slice(-120));
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
