/**
 * The quicklink list the browser opens on.
 *
 * A board with the restoration archive installed carries fifteen hundred
 * recovered broadcast days, and the handful holding a game are scattered
 * across years and networks behind page numbers nobody could remember -
 * Bamboozle on 152, a quiz hidden at 30A, sixteen BBC programs on Ceefax
 * 704 to 719. Landing on a service list and wishing the caller luck is not
 * a browser, it is a filing cabinet.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TeletextApp, type DoorSession } from '../app';

const DEMO = path.join(__dirname, '..', '..', '..', 'Teletext', 'uprough-demo');

/** A board of several packs, with a catalogue pointing into two of them. */
function board(withCatalogue = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-index-'));
  for (const id of ['bamboozle-1993', 'ceefax-1985', 'news-1999']) {
    const dir = path.join(root, id);
    fs.cpSync(DEMO, dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'service.json'),
      JSON.stringify({ id, title: id.toUpperCase(), homePage: '100' }),
    );
  }
  if (withCatalogue) {
    fs.writeFileSync(
      path.join(root, 'catalogue.json'),
      JSON.stringify({
        built: new Date().toISOString(),
        entries: [
          { service: 'bamboozle-1993', serviceTitle: 'Bamboozle 1993', page: 0x102, kind: 'game', label: 'Bamboozle 1993' },
          { service: 'ceefax-1985', serviceTitle: 'Ceefax 1985', page: 0x103, kind: 'program', label: 'GOMOKU', command: 'CHAIN "GOMOKU"', playable: true },
          { service: 'ceefax-1985', serviceTitle: 'Ceefax 1985', page: 0x104, kind: 'program', label: 'BREAKOU', command: 'CHAIN "BREAKOU"', playable: false },
        ],
      }),
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
      user: { username: 'tester', id: 1 },
      close: () => { this.closed = true; },
    };
  }
  get frame(): string {
    const frames = this.chunks.join('').split('\x1b[2J');
    return frames[frames.length - 1]
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b#[0-9]/g, '');
  }
  get all(): string {
    return this.chunks.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b#[0-9]/g, '');
  }
}

function open(root = board()): { term: Terminal; app: TeletextApp } {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), root);
  app.start();
  return { term, app };
}

export async function theBrowserOpensOnTheQuicklinkList(): Promise<void> {
  const { term } = open();
  assert.ok(term.frame.includes('TELETEXT GAMES'), 'the list is the first thing shown');
  assert.ok(term.frame.includes('Bamboozle 1993'), 'and it names a game');
  assert.ok(term.frame.includes('GOMOKU'), 'and a program');
}

export async function aQuicklinkNamesThePageItGoesTo(): Promise<void> {
  // The point of the thing: nobody has to remember that Bamboozle is 152.
  const { term } = open();
  assert.ok(/10[23]/.test(term.frame), 'the page number is on the line');
}

export async function aProgramThatWillNotLoadIsNotOffered(): Promise<void> {
  /*
   * BREAKOUT was listed as playable for a while when it was not. A
   * quicklink list that sends someone to a program answering `Bad program`
   * is worse than one that leaves it out.
   */
  const { term } = open();
  assert.ok(!term.frame.includes('BREAKOU'), 'an unplayable program is left off');
}

export async function enterOpensTheServiceOnThatPage(): Promise<void> {
  const { term, app } = open();
  app.handleInput('\r');
  assert.ok(/P10[0-9A-F]/.test(term.all), 'a page is on screen');
}

export async function aNumberPicksStraightOffTheList(): Promise<void> {
  // The way a teletext index has always worked.
  const { term, app } = open();
  app.handleInput('2');
  assert.ok(/P10[0-9A-F]/.test(term.all), 'the second entry opened');
}

export async function escapeComesBackToTheList(): Promise<void> {
  const { term, app } = open();
  app.handleInput('\r');
  app.handleInput('\x1b');
  // A lone ESC waits out its grace period first, to prove it is not the
  // opening byte of an arrow key (ESCAPE_GRACE_MS in the SDK).
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(term.frame.includes('TELETEXT GAMES'), 'back where we started');
}

export async function sShowsEveryServiceForSomebodyBrowsing(): Promise<void> {
  const { term, app } = open();
  app.handleInput('s');
  assert.ok(term.frame.includes('NEWS-1999'), 'the packs with no games are still reachable');
}

export async function aBoardWithNoCatalogueBehavesAsBefore(): Promise<void> {
  const { term } = open(board(false));
  assert.ok(!term.frame.includes('TELETEXT GAMES'), 'no list is invented');
  assert.ok(term.frame.includes('TELETEXT'), 'and the service picker is shown instead');
}
