/**
 * SUBS draws its feed on all three screens this board serves.
 *
 * WHY THIS IS A RUNTIME PROOF AND NOT A SOURCE PIN, the same reason
 * themec-40.test.ts gives: the real 68K binary runs under the real emulator on
 * a real petsciiMode session, and the bytes it writes to the socket are
 * replayed through the SDK's own AnsiToPetsciiTransducer into its
 * PetsciiMachine, which is the KERNAL oracle. The assertions are about painted
 * CELLS on that machine - what a C64 is showing - not about what the door
 * emitted or how many times something was called.
 *
 * THE BOARD IS NOT A FIXTURE (RULES.md). This asserts exact rows, so the
 * message base is one this file writes into a temp directory. Pointing at the
 * real board would put a sysop's messages in the assertions and go red the
 * next time anybody posted.
 *
 * BBS_ROOT and BBS_DATA_DIR are both set, and BEFORE the first backend
 * require: messageIndexManager resolves HeaderFile against BBS_ROOT in its
 * CONSTRUCTOR, and message bodies are found through config.get('dataDir'),
 * which reads BBS_DATA_DIR at module load. Setting one, or setting either
 * late, reads the headers from the fixture and looks for the bodies in the
 * real checkout.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../../..');
const SUBS = path.join(REPO, 'Doors', 'SUBS', 'subs');
const EIGHTY = path.join(__dirname, 'fixtures', 'subs-80.ans');

/* Before ANY backend import. See the header. */
const BOARD = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-subs-board-'));
process.env.BBS_ROOT = BOARD;
process.env.BBS_DATA_DIR = BOARD;

import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { CaptureSocket, beforeTeardown, screenCodeToChar } from './door-capture';

/** Eight public messages, all addressed to everyone, all with bodies. */
const SENDERS = ['Spot', 'Phantasm', 'Rebel', 'Nark'];
const COUNT = 8;

/**
 * REQUIRED, not imported: `import` is HOISTED above the `process.env`
 * assignments at the top of this file, so a static import of anything that
 * reads BBS_ROOT or BBS_DATA_DIR at module load - src/config.ts:102 does,
 * once, into a singleton - would capture the guard's per-worker temp board
 * instead of the fixture. The env is set by the time any function body runs.
 */
function buildBoard() {
  const { messageIndexManager, MsgStatus } = require('../../../src/services/MessageIndexManager');
  fs.mkdirSync(path.join(BOARD, 'Conf1', 'MsgBase'), { recursive: true });
  messageIndexManager.setBbsRoot(BOARD);
  messageIndexManager.initializeMessageIndex(1);
  const when = Math.floor(Date.UTC(2026, 8, 8, 12, 0, 0) / 1000);
  for (let n = 1; n <= COUNT; n++) {
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: n,
      toName: 'EALL',
      fromName: SENDERS[n % SENDERS.length]!,
      subject: `Cracking on real hardware ${n}`,
      msgDate: when,
      recv: 0,
      extMsgNum: 0,
    });
    fs.writeFileSync(
      path.join(BOARD, 'Conf1', 'MsgBase', String(n)),
      `The body of message ${n}.\nA second line.\n`,
      'latin1',
    );
  }
}

/**
 * Run the REAL binary under the REAL emulator for one caller geometry.
 *
 * `petsciiMode` is the only thing that separates the cases, exactly as it is
 * in production: doorScreenWidth()/doorScreenHeight() read it, BB_SCRWIDTH and
 * BB_SCRHEIGHT answer from them, and the door lays itself out from the answer.
 *
 * `doorCommand` is SUBS, not SUBSCAN: under the digest name this binary prints
 * three lines and exits without opening a screen at all.
 */
async function drive(cols: number, rows = 25): Promise<string> {
  const { AmigaDoorSession } = require('../../../src/amiga-emulation/AmigaDoorSession');
  const socket = new CaptureSocket();
  const petscii = cols <= 40;
  const session = new AmigaDoorSession(socket as any, {
    executablePath: SUBS,
    doorType: 'XIM',
    timeout: 30,
    args: ['1'],
    assigns: {},
    toolTypes: {},
    bbsSession: {
      user: { id: '1', username: 'Sysop', location: 'Local Console', secLevel: 255 },
      nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop',
      timeRemaining: 60, doorCommand: 'SUBS', doorId: 'SUBS',
      currentConf: 1, currentMsgBase: 1, conferenceName: 'Amiga Chat',
      petsciiMode: petscii,
      terminalType: petscii ? 'c64' : 'modern',
      screenWidth: cols,
      screenHeight: rows,
      tempData: {},
    },
  });

  // One frame, then leave. The door draws on entry and repaints only what
  // changed after that, so a single Q proves the screen and still exits
  // cleanly through ui_screen_close() + JH_SHUTDOWN.
  const quit = setTimeout(() => socket.emit('door:input', 'q'), 6000);
  try {
    await session.start();
  } finally {
    clearTimeout(quit);
  }
  return socket.ansi.join('');
}

/** Whether the door really did leave the screen black behind it (the cut beforeTeardown makes, door-capture.ts, hides it). */
function leavesScreenBlack(ansi: string): boolean {
  return /\x1b\[2J(\x1b\[H)?(\x1b\[\?25[hl])?\s*$/.test(ansi);
}

function petsciiScreen(ansi: string): { rows: string[]; painted: number } {
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(beforeTeardown(ansi));
  const { screen, cols, rows } = transducer.machine.state;
  const out: string[] = [];
  let painted = 0;
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const sc = screen[y * cols + x]!;
      if ((sc & 0x7f) !== 0x20) painted++;
      row += screenCodeToChar(sc);
    }
    out.push(row);
  }
  return { rows: out, painted };
}

describe('SUBS on all three screens', () => {
  jest.setTimeout(180000);

  beforeAll(() => {
    /*
     * tests/setup.ts imports src/database, which pulls src/config in before
     * this file's body runs - so the config singleton already holds the
     * guard's per-worker temp board. Dropped here so every later require
     * (buildBoard's, and drive's AmigaDoorSession) resolves against the
     * fixture instead.
     */
    jest.resetModules();
    buildBoard();
  });

  afterAll(() => {
    fs.rmSync(BOARD, { recursive: true, force: true });
  });

  it('the shipped .info files mark the door 40-ok, so the gate lets a C64 in', () => {
    for (const name of ['SUBS', 'SUBSCAN']) {
      const info = fs.readFileSync(path.join(REPO, 'Commands', 'BBSCmd', `${name}.info`), 'latin1');
      expect(info).toContain('MIN_COLUMNS=40');
      expect(info).toContain('TYPE=XIM');
      // Both registrations point at the SAME binary: the mode is chosen by the
      // name the caller typed (GET_CUSTOM_MSGBASE_MENUCMD), not by a build.
      expect(info).toContain('LOCATION=Doors/SUBS/subs');
      // The mark it must NOT carry: C64_ADAPT would put the frame adapter on
      // the socket and crop a screen that is already forty columns wide.
      expect(info).not.toContain('C64_ADAPT');
    }
  });

  it('the feed is readable at 40: the real door on a real C64 screen', async () => {
    const ansi = await drive(40);
    expect(leavesScreenBlack(ansi)).toBe(true);
    const { rows, painted } = petsciiScreen(ansi);

    // A C64 screen, and a full one.
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row).toHaveLength(40);
    expect(painted).toBeGreaterThan(100);

    // The door addressed nothing off a C64's glass. An addressed column of 60
    // on a 40-cell row wraps, and the row it wraps onto is the next message.
    const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    for (const m of cups) {
      expect(Number(m[1])).toBeLessThanOrEqual(25);
      expect(Number(m[2])).toBeLessThanOrEqual(40);
    }

    // Every message is on the glass, one per row, in PLAIN ASCENDING NUMBER
    // ORDER - which is the whole of the C*Base fidelity this door exists for.
    const numbers: number[] = [];
    for (const row of rows) {
      const m = row.match(/^\s*(?:>>)?\s*(\d+)\s+[A-Z]/);
      if (m) numbers.push(Number(m[1]));
    }
    expect(numbers.length).toBe(COUNT);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    // The cursor opens on the NEWEST message, which is where a discussion is.
    const caretRow = rows.findIndex(r => r.includes('>>'));
    expect(caretRow).toBeGreaterThan(0);
    expect(rows[caretRow]).toContain(String(COUNT));

    // The compact chrome: the door's name on row 1, a short status, a short
    // footer. The 80-column sentences are longer and would wrap here.
    expect(rows[0]!.trim()).toContain('SUBS');
    expect(rows.join('\n')).toContain('[INFO]');
    expect(rows.join('\n')).toContain('Q=LEAVE');

    // Nothing the transducer could not map. `?` is what an unmapped glyph
    // prints, and no part of this screen is meant to be one.
    expect(rows.join('')).not.toContain('?');
  });

  /**
   * The 80-column pin. Its subject is "the 40-column work did not disturb the
   * 80-column screen"; refresh it deliberately when the door's own layout
   * changes on purpose, never to make a red run green.
   *
   * REFRESHED 2026-09-15, deliberately: `ui_screen_open` hides the caller's
   * cursor now (ESC[?25l, 9379da62b, binaries rebuilt in 2e6f9a7a8), which is
   * a change to every C door on the board and moved the first byte of this
   * screen. Everything after it was byte-identical, which is what made the
   * refresh safe to make - checked before the file was rewritten.
   */
  it('an 80-column caller sees the door byte-for-byte as it was pinned', async () => {
    const ansi = await drive(80);
    const before = fs.readFileSync(EIGHTY, 'latin1');

    // The FIRST screen, not the whole session: what follows depends on how
    // many key waits the capture happened to fit, which is a property of the
    // machine and not of the door.
    const firstScreen = (out: string) => {
      const second = out.indexOf('\x1b[2J', out.indexOf('\x1b[2J') + 1);
      return second === -1 ? out : out.slice(0, second);
    };
    expect(firstScreen(ansi)).toBe(firstScreen(before));
  });

  /**
   * The responsive tier, and what it actually means for a 68K door on THIS
   * board.
   *
   * A 132-column ANSI caller is told the screen is 80 wide, on purpose:
   * BB_SCRWIDTH answers `doorScreenWidth()`, which is "80 for every ANSI
   * caller (byte-identical to before); the session width for a C64"
   * (xim/bbs-info.ts:376-381). So the door cannot and must not paint 132
   * columns - it would be painting past what the board says the caller has.
   *
   * HEIGHT is not clamped that way, and it is what a wide terminal really
   * gives a door here: the list is `screen.rows - 6`, so a 40-row caller sees
   * fifteen more messages without a single literal in the layout. That is what
   * this pins, along with "nothing is drawn wider than the board reported",
   * which is the failure a responsive test exists to catch.
   */
  it('a taller caller gets more messages, and nothing wider than the board reported', async () => {
    const ansi = await drive(132, 40);

    const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    for (const m of cups) {
      expect(Number(m[1])).toBeLessThanOrEqual(40);
      expect(Number(m[2])).toBeLessThanOrEqual(132);
    }

    // The extra ROWS were used: the list is screen.rows - 6, so a 40-row
    // caller is addressed below row 25 and a 25-row caller never is.
    expect(Math.max(...cups.map(m => Number(m[1])))).toBeGreaterThan(25);

    // And nothing is painted wider than the 80 the board reported. Measured on
    // the text between cursor addresses, with the colour sequences removed -
    // the door addresses the START of a row and then writes the whole row, so
    // the column in the CUP is 1 or 3 whatever the width.
    const plain = ansi.replace(/\x1b\[[0-9;]*m/g, '');
    const runs = plain.split(/\x1b\[\d+;\d+H/).map(r => r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
    expect(Math.max(...runs.map(r => r.length))).toBeLessThanOrEqual(80);
  });
});
