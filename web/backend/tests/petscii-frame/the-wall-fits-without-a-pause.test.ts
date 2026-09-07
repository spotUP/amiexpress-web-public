/**
 * Regression: dRE!WAll fits a C64 screen, so a 40-column caller is not asked
 * to page through it.
 *
 * The screen was 31 adapted rows against his 25. What overflowed it was not
 * the wall - the seven real comments cost one row each - but the door's own
 * filler for the slots NOBODY HAS WRITTEN IN: seven `VIRGIN LINE VIRGIN LINE
 * ... dR.dRE!/tRSi` rows, each a `record` row costing TWO. Blanking them
 * leaves 24 rows, and `unseenRows()` is what the pause in xim/io.ts:1553-1562
 * asks before it holds the door.
 *
 * The assertion is therefore on unseenRows, not on a row count: it is the
 * exact question the pause asks, so this test fails the moment the caller
 * would be prompted again.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

const FIXTURE = path.resolve(
  __dirname,
  '../../../../sdk/tests/petscii/frame/fixtures/wall.ans',
);
/**
 * One WORD, not the phrase. `renderDiff` breaks a row into runs at every
 * cursor move, so `VIRGIN LINE` is never contiguous on the wire and asserting
 * the phrase passed even with the rule removed - verified by reverting it.
 */
const PLACEHOLDER = 'VIRGIN';
/**
 * A real comment on the wall, and the door's prompt: both must survive.
 *
 * Word by word, because `renderDiff` paints RUNS: between `uPTOWN` and
 * `alive!` the wire carries a cursor address, so the sentence is never a
 * contiguous string on it. A run also ends at a COLOUR change, which is why
 * the prompt is checked as `Line` and not `Line:` - the colon is white where
 * the word is cyan. The words are what proves the row was painted.
 */
const COMMENT_WORDS = ['uPTOWN', 'alive!'];
const PROMPT_WORDS = ['Enter', 'your', 'Line'];

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

describe('dRE!WAll at 40 columns fits, so the caller is never paused', () => {
  jest.setTimeout(20000);

  let wire = '';
  let unseen = -1;

  beforeAll(async () => {
    const seen: string[] = [];
    const socket: any = {
      emit: (_event: string, payload: any) => {
        if (typeof payload === 'string') seen.push(payload);
        return true;
      },
    };
    socket.session = { terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    const adapter = installC64DoorAdapter(socket, socket.session);
    expect(adapter).not.toBeNull();

    const text = fs.readFileSync(FIXTURE, 'latin1');
    for (let i = 0; i < text.length; i += 64) {
      socket.emit('ansi-output', text.slice(i, i + 64));
      if (i % 512 === 0) await wait(12);
    }
    await wait(60);
    unseen = adapter!.unseenRows();
    wire = seen.join('');
    uninstallC64DoorAdapter(socket);
  });

  test('nothing is left unseen, so xim/io.ts never opens a pause', () => {
    expect(unseen).toBe(0);
  });

  test('the empty slots are gone', () => {
    expect(wire).not.toContain(PLACEHOLDER);
  });

  test('every real line the wall carries is still on the screen', () => {
    expect([...COMMENT_WORDS, ...PROMPT_WORDS].filter((w) => !wire.includes(w))).toEqual([]);
  });

  /**
   * The same wall at 80 columns (2026-09-07). The placeholder slots are a
   * TEXT rule - stripNarrowNoise blanks them because they cost a 40-column
   * caller rows - and an 80-column PETSCII caller has the rows the 80-column
   * ANSI caller has, so he keeps them.
   *
   * As of the adapter's own width gate he keeps them for a plainer reason:
   * he is not adapted at all, so nothing was in a position to blank them.
   */
  test('an 80-column PETSCII caller keeps the slots, and still never pages', async () => {
    const seen: string[] = [];
    const socket: any = {
      emit: (_event: string, payload: any) => {
        if (typeof payload === 'string') seen.push(payload);
        return true;
      },
    };
    socket.session = { terminalType: 'c64', petsciiMode: true, petsciiColumns: 80, screenWidth: 40, screenHeight: 25 };
    // NOT ADAPTED AT ALL, since 2026-09-07: the adapter is for forty columns.
    // This caller has the columns the door drew for, so his bytes are the
    // door's own and the slots survive because nothing removed them.
    const adapter = installC64DoorAdapter(socket, socket.session);
    expect(adapter).toBeNull();
    const text = fs.readFileSync(FIXTURE, 'latin1');
    for (let i = 0; i < text.length; i += 64) {
      socket.emit('ansi-output', text.slice(i, i + 64));
      if (i % 512 === 0) await wait(12);
    }
    await wait(60);
    const wide = seen.join('');
    uninstallC64DoorAdapter(socket);

    // No adapter, so nothing can hold the door on an adapted frame: the pause
    // question is the ordinary line-count one every 80-column caller gets.
    const { FrameReconstructor } = require('../../../../sdk/petscii/frame/ansi-screen');
    const fr = new FrameReconstructor({ cols: 80, rows: 25 });
    fr.write(wide);
    const screen = fr.snapshot().cells.map((row: any[]) => row.map((c: any) => c.ch).join(''));
    expect(screen.some((row: string) => row.includes(PLACEHOLDER))).toBe(true);
  });
});
