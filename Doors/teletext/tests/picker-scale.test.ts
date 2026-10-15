/**
 * The service list, with the archive installed.
 *
 * A board carrying the restoration archive has over a thousand packs on it -
 * one per recovered broadcast day. The list used to draw the first nineteen
 * and stop: no scrolling, no way to reach the rest, and a quick-pick bound
 * to the digits 1-9. At that size it has to be searched, not read.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TeletextApp, type DoorSession } from '../app';

const DEMO = path.join(__dirname, '..', '..', '..', 'Teletext', 'uprough-demo');

/** A board with many packs, named the way the importer names them. */
function crowdedBoard(count: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-many-'));
  for (let i = 0; i < count; i++) {
    const year = 1990 + (i % 12);
    // Unique per pack: a repeated id is one directory, not two.
    const id = `ch4-${year}-day${String(i).padStart(3, '0')}`;
    const dir = path.join(root, id);
    fs.cpSync(DEMO, dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'service.json'),
      JSON.stringify({ id, title: `CH4 ${year} edition ${i}`, homePage: '100' }),
    );
  }
  return root;
}

class Terminal {
  readonly chunks: string[] = [];
  closed = false;
  session(): DoorSession {
    return {
      socket: {
        emit: (_e: string, data?: unknown) => { if (typeof data === 'string') this.chunks.push(data); },
        on: () => {}, off: () => {},
      },
      bbsSession: { texttvMode: true, screenHeight: 25 },
      user: { username: 'tester' },
      close: () => { this.closed = true; },
    };
  }
  get text(): string {
    return strip(this.chunks.join(''));
  }

  /**
   * Only what is on screen NOW.
   *
   * Every keystroke repaints, so the accumulated stream still holds the
   * frames the caller has already replaced - and a test reading that would
   * pass while the screen showed the opposite.
   */
  get frame(): string {
    const frames = this.chunks.join('').split('\x1b[2J');
    return strip(frames[frames.length - 1]);
  }
  clear(): void { this.chunks.length = 0; }
}

function strip(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b#[0-9]/g, '')
    .replace(/\x1b\[\?25[lh]/g, '');
}

function type(app: TeletextApp, keys: string): void {
  for (const ch of keys) app.handleInput(ch);
}

export async function aCrowdedBoardStillListsSomething(): Promise<void> {
  const term = new Terminal();
  new TeletextApp(term.session(), crowdedBoard(60)).start();
  assert.ok(term.frame.includes('CH4 1990 edition 0'), 'the first pack is on screen');
  // The count is shown, so the caller knows the list runs past the screen.
  // Matched against the bar itself: with the escape codes stripped, the
  // row above runs straight into it, so there is no word boundary to use.
  assert.ok(/60\s+TYPE=Find/.test(term.text), 'the bar says how many there are');
}

export async function typingNarrowsTheList(): Promise<void> {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), crowdedBoard(60));
  app.start();
  type(app, '1995');
  const shown = term.frame;
  assert.ok(shown.includes('Find: 1995'), 'what was typed is shown');
  assert.ok(shown.includes('1995'), 'a match is listed');
  assert.ok(!shown.includes('CH4 1990 '), 'a non-match is gone');
}

export async function backspaceWidensItAgain(): Promise<void> {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), crowdedBoard(60));
  app.start();
  type(app, '1995');
  type(app, '\x7f\x7f\x7f\x7f');
  assert.ok(term.frame.includes('CH4 1990 edition 0'), 'everything is back');
}

export async function aFilterThatMatchesNothingSaysSo(): Promise<void> {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), crowdedBoard(20));
  app.start();
  type(app, 'zzzz');
  assert.ok(term.frame.includes('Nothing matches'), 'it says so rather than going blank');
}

export async function theListScrollsPastTheBottomOfTheScreen(): Promise<void> {
  // THE BUG THIS EXISTS FOR: the old list drew rows 4.. and returned at the
  // bottom of the screen, so entry 40 could not be reached at all.
  const term = new Terminal();
  const app = new TeletextApp(term.session(), crowdedBoard(60));
  app.start();
  for (let i = 0; i < 40; i++) app.handleInput('\x1b[B');
  assert.ok(!term.frame.includes('CH4 1990 edition 0'), 'the top of the list has scrolled away');
  assert.ok(term.frame.includes('>'), 'a row is still selected');
}

export async function enterOpensWhatIsSelectedAfterFiltering(): Promise<void> {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), crowdedBoard(60));
  app.start();
  type(app, '1995');
  term.clear();
  type(app, '\r');
  // Opening a service paints a page, which carries the page number bar.
  assert.ok(/P1[0-9A-F]{2}/.test(term.text), 'a page is on screen');
}
