/**
 * Teletext 40-column geometry (texttv-40): the T answer stamps the classic
 * 40x25 grid, and every width authority below answers it - the same path
 * PETSCII sessions use, with nothing transduced. Pure unit level; the
 * executeDoor gate case lives in tests/doors/door-min-columns-gate.test.ts
 * and the answer matrix in tests/handlers/graphics-answer.test.ts.
 */
import { doorScreenWidth, doorScreenHeight } from '../../src/amiga-emulation/xim/screen-width.util';
import { sessionColumns, resolveDoorMinColumns } from '../../src/utils/door-min-columns.util';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import * as path from 'path';
import { isNarrow } from '../../src/utils/table-format.util';
import { wrapForSession, wrapDoorTextForSession } from '../../src/utils/wrap-for-session.util';
import { wipeEffectsEnabled } from '../../src/utils/screen-wipe.util';

const T = { texttvMode: true, screenWidth: 40, screenHeight: 26 };
const ANSI = { texttvMode: false, petsciiMode: false, screenWidth: 80, screenHeight: 24 };
const C64 = { petsciiMode: true, screenWidth: 40, screenHeight: 25, petsciiColumns: 40 as const };

describe('teletext 40-column authorities', () => {
  test('doors read 40x26 (teletext) and 40x25 (C64)', () => {
    expect(doorScreenWidth(T as any, 80)).toBe(40);
    expect(doorScreenHeight(T as any, 24)).toBe(26);
    expect(doorScreenWidth(C64 as any, 80)).toBe(40);
    expect(doorScreenWidth(ANSI as any, 80)).toBe(80);
    expect(doorScreenWidth(null, 80)).toBe(80);
  });

  test('the session narrows: columns and the narrow switch', () => {
    expect(sessionColumns(T as any)).toBe(40);
    expect(sessionColumns(ANSI as any)).toBe(80);
    expect(isNarrow(T as any)).toBe(true);
    expect(isNarrow(ANSI as any)).toBe(false);
    expect(isNarrow(null)).toBe(false);
  });

  test('prose reflows at 40 for teletext, byte-identical for ANSI', () => {
    const prose = 'word '.repeat(30).trim();
    const folded = wrapForSession(prose, T as any);
    expect(folded).not.toBe(prose);
    // Parity with the C64 path, byte for byte (the wrapper's deferred-wrap
    // lets one line reach 41 - its behavior, shared, not teletext's).
    expect(folded).toBe(wrapForSession(prose, C64 as any));
    expect(Math.max(...folded.split('\n').map((l) => l.length))).toBeLessThanOrEqual(41);
    expect(wrapForSession(prose, ANSI as any)).toBe(prose);
    expect(wrapDoorTextForSession(prose, T as any)).not.toBe(prose);
    expect(wrapDoorTextForSession(prose, ANSI as any)).toBe(prose);
  });

  test('wipe effects stay off in teletext, on for ANSI', () => {
    expect(wipeEffectsEnabled(T as any)).toBe(false);
    expect(wipeEffectsEnabled(ANSI as any)).toBe(true);
    expect(wipeEffectsEnabled(null)).toBe(true);
  });
});

describe('the doors a teletext caller is here for', () => {
  /*
   * THE GATE IS DEFAULT-CLOSED, AND THAT IS RIGHT - but it means a door
   * that fits 40 columns is refused until it SAYS so. BEEB did not, and a
   * teletext caller got "THIS DOOR NEEDS AN 80 COLUMN SCREEN" from a door
   * whose whole purpose is a machine that boots into teletext.
   *
   * Read from the real registration rather than restated here: a test that
   * repeats the tooltype it is checking proves only that two files agree
   * with each other.
   */
  const REGISTRATIONS = path.resolve(__dirname, '../../../../board/Commands/BBSCmd');
  const TELETEXT_DOORS = ['TELETEXT', 'TTQUIZ', 'TTWORMS', 'BEEB', 'TEXTTV'];

  test.each(TELETEXT_DOORS)('%s opens for a 40-column teletext caller', command => {
    const toolTypes = Object.fromEntries(
      readTooltypeMap(path.join(REGISTRATIONS, `${command}.info`)),
    );
    expect(Object.keys(toolTypes).length).toBeGreaterThan(0);
    expect(resolveDoorMinColumns({ command, toolTypes })).toBeLessThanOrEqual(sessionColumns(T as any));
  });
});
