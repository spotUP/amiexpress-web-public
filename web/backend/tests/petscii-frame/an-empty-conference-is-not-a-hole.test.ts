/**
 * Regression: an empty conference does not reach a C64 caller as a screen of
 * black. Reported from the live board on 2026-09-07 - "when ctop has data in
 * petscii mode it shows mostly black".
 *
 * What he was looking at: ctop numbers every slot of its table whether anyone
 * has uploaded into it or not, those slots are blanked at 40 columns (they
 * cost a row and say nothing), and what was left was a header, NINE blank
 * rows, and the totals. The screen fit, so nothing paged - it just read as a
 * hole.
 *
 * Two things are asserted, both off the oracle - what a C64 SHOWS after the
 * real adapter, the real transport and the real transducer:
 *   1. no gap of three or more blank rows between the first and last painted
 *      row (`collapseLongBlankRuns`);
 *   2. the screen still carries its header AND its totals, so the fix is not
 *      "show less".
 */
import * as fs from 'fs';
import * as path from 'path';

import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

const COLS = 40;
const ROWS = 25;
const FIXTURE = path.resolve(
  __dirname,
  '../../../../sdk/tests/petscii/frame/fixtures/ctop.ans',
);

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/** The fixture through the real adapter and transport, onto the KERNAL oracle. */
async function glass(): Promise<string[]> {
  const writes: Buffer[] = [];
  const session: any = {
    terminalType: 'c64', petsciiMode: true, screenWidth: COLS, screenHeight: ROWS,
  };
  const connection: any = {
    sessionId: 'empty-conference',
    session,
    write: (d: Buffer | string) => writes.push(Buffer.from(d as any)),
    on: () => undefined,
    off: () => undefined,
    close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);
  installC64DoorAdapter(emitter, session, { tickMs: 5, maxFrameMs: 40 });

  const text = fs.readFileSync(FIXTURE, 'latin1');
  let n = 0;
  for (let i = 0; i < text.length; i += 64, n += 1) {
    emitter.emit('ansi-output', text.slice(i, i + 64));
    if (n % 8 === 7) await wait(20);
  }
  await wait(60);
  uninstallC64DoorAdapter(emitter);

  const machine = new PetsciiMachine();
  machine.feed(Buffer.concat(writes));
  return Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => {
      const sc = machine.state.screen[y * COLS + x] & 0x7f;
      if (sc >= 0x01 && sc <= 0x1a) return String.fromCharCode(0x60 + sc);
      if (sc >= 0x20 && sc <= 0x3f) return String.fromCharCode(sc);
      if (sc >= 0x41 && sc <= 0x5a) return String.fromCharCode(sc);
      return sc === 0x20 ? ' ' : '?';
    }).join('').replace(/ +$/, ''),
  );
}

describe('ctop on an empty conference, at 40 columns', () => {
  jest.setTimeout(20000);

  let rows: string[] = [];
  beforeAll(async () => { rows = await glass(); });

  test('no gap of three or more blank rows inside the screen', () => {
    const painted = rows
      .map((t, y) => ({ y, blank: t.trim().length === 0 }))
      .filter((r) => !r.blank)
      .map((r) => r.y);
    expect(painted.length).toBeGreaterThan(5);

    const gaps: Array<{ after: number; rows: number }> = [];
    for (let i = 1; i < painted.length; i += 1) {
      const gap = painted[i] - painted[i - 1] - 1;
      if (gap >= 3) gaps.push({ after: painted[i - 1], rows: gap });
    }
    expect(gaps).toEqual([]);
  });

  test('the header and the totals both survive the squeeze', () => {
    const screen = rows.join('\n');
    expect(['Conference Top Uploaders', 'Total Uploaded', 'Top Uploader Record']
      .filter((t) => !screen.includes(t))).toEqual([]);
  });
});
