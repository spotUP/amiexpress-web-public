/**
 * Phase 1 of 80-column PETSCII: the geometry is DATA, not a constant.
 *
 * petsciiMode still means "PETSCII bytes on the wire"; petsciiColumns says
 * how wide the screen is. Every assertion here has its 40 case beside its
 * 80 case, because the whole point is that one session's answer is not
 * every session's answer.
 */
import {
  C64_COLUMNS, DEFAULT_DOOR_COLUMNS, doorScreenWidth, doorScreenHeight, petsciiColumnsOf,
  applyClientReportedGeometry,
} from '../../src/amiga-emulation/xim/screen-width.util';
import { sessionColumns, doorShowsC64Mark } from '../../src/utils/door-min-columns.util';

const c64 = { petsciiMode: true } as const;
const wide = { petsciiMode: true, petsciiColumns: 80 } as const;

describe('a PETSCII session has a width of its own', () => {
  it('40 stays the answer for a C64, and 80 is the answer for the wide screen', () => {
    expect(doorScreenWidth(c64)).toBe(C64_COLUMNS);
    expect(doorScreenWidth(wide)).toBe(DEFAULT_DOOR_COLUMNS);
    expect(petsciiColumnsOf(c64)).toBe(40);
    expect(petsciiColumnsOf(wide)).toBe(80);
    // Absent, nonsense, or a width nobody offers: the C64's 40.
    expect(petsciiColumnsOf({ petsciiMode: true, petsciiColumns: 64 as unknown as 40 })).toBe(40);
    expect(petsciiColumnsOf(null)).toBe(40);
    // An ANSI caller is untouched by any of it.
    expect(doorScreenWidth({ screenWidth: 132 })).toBe(DEFAULT_DOOR_COLUMNS);
    expect(doorScreenWidth(null)).toBe(DEFAULT_DOOR_COLUMNS);
  });

  it('the reported width says nothing about a PETSCII screen, at either width', () => {
    // The width is the MODE's. A browser reporting 132 does not make an
    // 80-column PETSCII screen 132 wide, and a client reporting 22 does not
    // make a C64's screen 22 - the two widths are chosen at the graphics
    // prompt and nothing on the wire may override them. (Before the wide
    // screen existed this consulted screenWidth, which is how a `P` answer
    // could inherit the xterm's geometry.)
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 22 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 132 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, petsciiColumns: 80, screenWidth: 132 })).toBe(80);
    expect(doorScreenWidth({ petsciiMode: true, petsciiColumns: 80, screenWidth: 22 })).toBe(80);
  });

  it('both screens are 25 rows, and neither takes geometry from the browser', () => {
    expect(doorScreenHeight(c64, 22)).toBe(25);
    expect(doorScreenHeight(wide, 22)).toBe(25);
    const session: any = { petsciiMode: true, petsciiColumns: 80, screenWidth: 80, screenHeight: 25 };
    expect(applyClientReportedGeometry(session, 132, 43)).toBe(false);
    expect(session.screenWidth).toBe(80);
  });

  it('sessionColumns and the DOORS mark follow the session, not the constant', () => {
    expect(sessionColumns(c64)).toBe(40);
    expect(sessionColumns(wide)).toBe(80);
    // A claim is only meaningful for the 68K types that route through the
    // adapter, so the fixtures carry one.
    const marked = { type: 'XIM', toolTypes: { C64_ADAPT: '40' } } as any;
    const eighty = { type: 'XIM', toolTypes: { C64_ADAPT: '80' } } as any;
    const unmarked = { type: 'XIM', toolTypes: {} } as any;
    // A claim is a NARROWEST width: 40 is satisfied by an 80-column screen.
    expect(doorShowsC64Mark(marked)).toBe(true);
    expect(doorShowsC64Mark(marked, 80)).toBe(true);
    expect(doorShowsC64Mark(eighty, 40)).toBe(false);
    expect(doorShowsC64Mark(eighty, 80)).toBe(true);
    expect(doorShowsC64Mark(unmarked, 80)).toBe(false);
  });
});
