/**
 * "80 column petscii dont need any special petscii rules it can use the normal
 * /X doors for everything and normal file lists etc" (sysop, 2026-09-07).
 *
 * The board had two lanes asking the same question in different words. The
 * WIDTH lane (sessionColumns, isNarrow, wrapForSession, servesPetsciiArt) was
 * already converted to "am I forty wide?". The ADAPTER lane still asked "am I
 * PETSCII?", so an 80-column caller was installed with a frame adapter whose
 * fold is the identity - and whose everything else is not.
 *
 * These are the predicates themselves, at both widths, so the two lanes can
 * never drift apart again.
 */
import { c64AdapterDrives } from '../../../src/server/c64-door-adapter';
import { doorOpensForC64, sessionColumns, doorShowsC64Mark } from '../../../src/utils/door-min-columns.util';
import { isNarrow } from '../../../src/utils/table-format.util';
import { doorScreenWidth, petsciiColumnsOf } from '../../../src/amiga-emulation/xim/screen-width.util';
import { servesPetsciiArt } from '../../../src/handlers/screen.handler';
import { petsciiTextScreenPlan } from '../../../src/utils/ansi-art-detect.util';

/** A caller who answered `P`: a C64. */
const c64 = { petsciiMode: true, petsciiColumns: 40, screenWidth: 40, terminalType: 'c64' } as any;
/** A caller who answered `P8`: PETSCII bytes on an 80-column screen. */
const wide = { petsciiMode: true, petsciiColumns: 80, screenWidth: 80 } as any;
/** ...and the ordinary 80-column ANSI caller the wide one must resemble. */
const ansi = { petsciiMode: false, screenWidth: 80, terminalType: 'modern' } as any;

/** A 68K door marked for the C64 fold. */
const markedDoor = { type: 'XIM', toolTypes: { C64_ADAPT: '40', MIN_COLUMNS: '80' } } as any;

describe('the width every part of the board answers with', () => {
  it('is 40 for a C64 and 80 for the wide screen, from one authority', () => {
    expect([petsciiColumnsOf(c64), petsciiColumnsOf(wide)]).toEqual([40, 80]);
    expect([doorScreenWidth(c64), doorScreenWidth(wide)]).toEqual([40, 80]);
    expect([sessionColumns(c64), sessionColumns(wide), sessionColumns(ansi)]).toEqual([40, 80, 80]);
  });
});

describe('nothing adapts an 80-column PETSCII caller', () => {
  it('the frame adapter drives a C64 and nobody else', () => {
    expect(c64AdapterDrives(c64)).toBe(true);
    expect(c64AdapterDrives(wide)).toBe(false);
    expect(c64AdapterDrives(ansi)).toBe(false);
  });

  it('a door marked C64_ADAPT opens ADAPTED for a C64 and unadapted for the wide caller', () => {
    expect(doorOpensForC64(markedDoor, c64)).toBe(true);
    expect(doorOpensForC64(markedDoor, wide)).toBe(false);
    expect(doorOpensForC64(markedDoor, ansi)).toBe(false);
  });

  it('...and the wide caller is let into that door anyway, by width', () => {
    // MIN_COLUMNS=80 and he HAS eighty: the ordinary gate lets him in, so
    // refusing the adaptation refuses him nothing.
    expect(sessionColumns(wide)).toBeGreaterThanOrEqual(80);
  });
});

describe('the narrow layouts are for the narrow caller', () => {
  it('the file list, the tables and the prompts fold for a C64 only', () => {
    expect(isNarrow(c64)).toBe(true);
    expect(isNarrow(wide)).toBe(false);
    expect(isNarrow(ansi)).toBe(false);
  });

  it('40-column art is served to a C64 only', () => {
    expect(servesPetsciiArt(c64)).toBe(true);
    expect(servesPetsciiArt(wide)).toBe(false);
  });

  it('an 80-column ANSI screen is folded for a C64 and passed to the wide caller', () => {
    const art = ['+' + '-'.repeat(70) + '+', ...Array.from({ length: 8 }, () => '|' + '#'.repeat(70) + '|')].join('\r\n');
    expect(petsciiTextScreenPlan(art, c64)).toBe('art-skip');
    expect(petsciiTextScreenPlan(art, wide)).toBe('passthrough');
    expect(petsciiTextScreenPlan(art, ansi)).toBe('passthrough');
  });

  it('the [C64] mark still means "this door reaches forty"', () => {
    // Unchanged by any of the above: it is a statement about the DOOR.
    expect(doorShowsC64Mark(markedDoor)).toBe(true);
  });
});
