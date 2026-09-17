/**
 * A page that carried a program, and the key that runs it.
 *
 * Ceefax put telesoftware on ordinary page numbers - GOMOKU was 717 - and
 * those pages were never meant to be looked at: their rows are a program,
 * not characters. Painted as text they are a screenful of mojibake, which
 * is how they first appeared here and read as a rendering bug.
 *
 * The pack's sidecar says which pages carried what, so the browser can show
 * a page for what it is and hand the program to the board's BBC Micro.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TeletextApp, type DoorSession } from '../app';

const DEMO = path.join(__dirname, '..', '..', '..', 'Teletext', 'uprough-demo');

/** A recovered program, claimed to have been broadcast on page 102. */
const PROGRAM = {
  title: 'GOMOKU',
  file: 'GOMOKU',
  kind: 'tokenised' as const,
  command: 'CHAIN "GOMOKU"',
  pages: [0x102],
  blocks: 8,
  complete: true,
  intact: true,
};

/**
 * A board holding the demo pack, with a telesoftware sidecar written into
 * it. The map is data, so a real recovery is not needed to prove the
 * browser reads it - and a 615-page pack in a unit test is a slow test.
 */
function board(programs: unknown[] = [PROGRAM], disc = 'ceefax-1985.ssd'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-tsw-test-'));
  const pack = path.join(root, 'uprough-demo');
  fs.cpSync(DEMO, pack, { recursive: true });
  fs.writeFileSync(
    path.join(pack, 'telesoftware.json'),
    JSON.stringify({ disc, programs }, null, 2),
  );
  return root;
}

class Terminal {
  readonly chunks: string[] = [];
  readonly events: Array<{ event: string; data: unknown }> = [];
  closed = false;

  session(): DoorSession {
    return {
      socket: {
        emit: (event: string, data?: unknown) => {
          this.events.push({ event, data });
          if (typeof data === 'string') this.chunks.push(data);
        },
        on: () => {},
        off: () => {},
      },
      bbsSession: { texttvMode: true, screenHeight: 25 },
      user: { username: 'tester' },
      close: () => { this.closed = true; },
    };
  }

  get text(): string {
    return this.chunks
      .join('')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b#[0-9]/g, '')
      .replace(/\x1b\[\?25[lh]/g, '');
  }

  opened(): { url?: string; title?: string } | null {
    const hit = [...this.events].reverse().find(e => e.event === 'emulator:open');
    return hit ? (hit.data as { url?: string; title?: string }) : null;
  }
}

/** Open the browser on the demo pack and go to a page. */
function browseTo(root: string, page: string): { term: Terminal; app: TeletextApp } {
  const term = new Terminal();
  const app = new TeletextApp(term.session(), root);
  app.start();
  for (const digit of page) app.handleInput(digit);
  return { term, app };
}

export async function aTelesoftwarePageIsDescribedNotDrawn(): Promise<void> {
  const { term } = browseTo(board(), '102');
  const text = term.text;
  assert.ok(text.includes('TELESOFTWARE'), 'the page says what it is');
  assert.ok(text.includes('GOMOKU'), 'and names the program');
  assert.ok(text.includes('CHAIN "GOMOKU"'), 'and says what it is on the Beeb');
  assert.ok(text.includes('PRESS RED'), 'and offers it');
}

export async function redRunsTheProgramOnTheBoardsBeeb(): Promise<void> {
  const { term, app } = browseTo(board(), '102');
  app.handleInput('r');

  const opened = term.opened();
  assert.ok(opened, 'R on a telesoftware page opens the emulator');
  const url = opened!.url ?? '';
  assert.ok(url.includes('disc1=ceefax-1985.ssd'), `the disc is mounted: ${url}`);
  assert.ok(
    url.includes(`autotype=${encodeURIComponent('CHAIN "GOMOKU"\n')}`),
    `the program is typed in for the caller: ${url}`,
  );
}

export async function autotypeIsNeverSentWithAutoboot(): Promise<void> {
  /*
   * THE TWO ARE EXCLUSIVE IN THE EMULATOR. jsbeeb reads autoboot,
   * autochain, autorun and autotype in that order and takes the FIRST it
   * finds, so a URL carrying both boots the disc into its catalogue and
   * silently drops the program the caller asked for.
   */
  const { term, app } = browseTo(board(), '102');
  app.handleInput('r');
  const url = term.opened()?.url ?? '';
  assert.ok(url.includes('autotype='), 'it types');
  assert.ok(!url.includes('autoboot'), `and does not also boot: ${url}`);
}

export async function aDamagedProgramIsOfferedHonestly(): Promise<void> {
  const damaged = { ...PROGRAM, intact: false };
  const { term } = browseTo(board([damaged]), '102');
  assert.ok(term.text.includes('will not run'), 'a broken decode says so');
  assert.ok(!term.text.includes('PRESS RED'), 'and is not offered as playable');
}

export async function anOrdinaryPageKeepsRedForItsLink(): Promise<void> {
  // The coloured keys must not change meaning on the 99% of pages that
  // carry no program.
  const { term } = browseTo(board(), '100');
  assert.ok(!term.text.includes('TELESOFTWARE'), 'page 100 is an ordinary page');
}

export async function aPackWithNoSidecarBrowsesAsBefore(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-nosidecar-'));
  fs.cpSync(DEMO, path.join(root, 'uprough-demo'), { recursive: true });
  const term = new Terminal();
  const app = new TeletextApp(term.session(), root);
  app.start();
  assert.ok(!term.text.includes('TELESOFTWARE'), 'no sidecar, no program pages');
  assert.strictEqual(term.opened(), null, 'and nothing is launched');
}
