/**
 * THE C64 SCREEN IS DRAWN FOR FORTY COLUMNS, NOT FOLDED INTO THEM.
 *
 * The sysop, 2026-09-22: "so it should be fixed like we did with the others
 * add a proper c64 view to conftop". The others are GL and the glc-viewer -
 * a door whose narrow screen is its own layout rather than an eighty-column
 * table run through the frame adapter.
 *
 * What this pins is the promise the `MIN_COLUMNS=40` tooltype makes to the
 * gate: every row this door paints fits a C64's screen, the whole screen fits
 * its twenty-five rows with the board's pause still to come, and the table
 * that could not survive the fold - rank, handle, files, bytes - is all
 * there.
 */
import {
  aggregateCtop,
  decodeCtopHeader,
  type CtopRecord,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { printableWidth } from '@amiexpress/bbs-door-sdk/formats/estringf';

import {
  BOARD_PAUSE_ROWS,
  NARROW_WIDTH,
  narrowListRows,
  renderNarrowScreen,
} from '../../../../../board/Doors/ctop-viewer/src/narrow';
import type { CtopScreen } from '../../../../../board/Doors/ctop-viewer/src/wide';

/** The live Conf1 of 2026-09-22, as the board had it. */
function liveHeader(): Buffer {
  const buf = Buffer.alloc(96);
  buf.writeInt32BE(17795, 0);
  buf.writeInt32BE(17788, 4);
  buf.write('sLASH', 8, 'latin1');
  Buffer.from([0, 0, 0, 0, 0x14, 0x57, 0x01, 0x38]).copy(buf, 40);
  buf.writeInt32BE(5, 48);
  buf.write('sysop', 52, 'latin1');
  Buffer.from([0, 0, 0, 0, 0, 0x14, 0x53, 0x87]).copy(buf, 84);
  buf.writeInt32BE(7, 92);
  return buf;
}

const LIVE_RECORDS: CtopRecord[] = [
  { userName: 'sysop', location: 'Server Room', bytes: 46_336 },
  { userName: 'sysop', location: 'Server Room', bytes: 35_769 },
  { userName: 'EALL/HT', location: '\\o/ HACK N TRADE \\o/', bytes: 49_246 },
];

function screen(records: CtopRecord[] = LIVE_RECORDS): CtopScreen {
  return {
    period: aggregateCtop(decodeCtopHeader(liveHeader()), records),
    conferenceName: 'Lamer Zone',
    today: 17794,
    rows: 12,
    skipEmpty: true,
    minLimit: 0n,
    showResetDate: false,
  };
}

describe('every row of the C64 screen', () => {
  it('fits the forty columns a C64 has', () => {
    for (const line of renderNarrowScreen(screen())) {
      expect(printableWidth(line)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('leaves the last cell alone, so the board prompt keeps its own line', () => {
    for (const line of renderNarrowScreen(screen())) {
      expect(printableWidth(line)).toBeLessThanOrEqual(NARROW_WIDTH - 1);
    }
  });

  it('closes its own pen, so the next row is not painted by this one', () => {
    for (const line of renderNarrowScreen(screen())) {
      if (line.length > 0) expect(line.endsWith('\x1b[0m')).toBe(true);
    }
  });
});

describe('the whole C64 screen', () => {
  it('fits twenty-five rows with the board pause still to come', () => {
    const lines = renderNarrowScreen(screen());

    expect(lines.length).toBeLessThanOrEqual(25 - BOARD_PAUSE_ROWS);
  });

  it('sizes its list to the screen, not to the sysop ROWS setting', () => {
    // Twelve rows asked for; fifteen fit under the chrome, so twelve it is.
    expect(narrowListRows(12)).toBe(12);
    // Thirty asked for on a C64 would scroll the title away.
    expect(narrowListRows(30)).toBe(15);
    // And on a screen that reported fewer rows than a C64 has.
    expect(narrowListRows(12, 18)).toBe(8);
  });
});

describe('the table a C64 caller reads', () => {
  it('has the rank, the handle, the file count and the bytes', () => {
    const plain = renderNarrowScreen(screen()).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));
    const row = plain.find(line => line.includes('sysop'))!;

    expect(row).toContain(' 1 sysop');
    expect(row).toContain('  2');          // two files
    expect(row).toContain('82,105');       // and their bytes, added up
  });

  it('cuts a handle too long for its column, and says it cut it', () => {
    const plain = renderNarrowScreen(screen([
      { userName: 'A-VERY-LONG-HANDLE-INDEED', location: 'x', bytes: 1 },
    ])).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));

    expect(plain.some(line => line.includes('A-VERY-LONG-HA...'))).toBe(true);
  });

  it('says so when nobody has uploaded', () => {
    const plain = renderNarrowScreen(screen([])).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));

    expect(plain.some(line => line.includes('NO UPLOADS IN THIS CONFERENCE'))).toBe(true);
  });

  it('keeps both record holders, which is what the period is for', () => {
    const plain = renderNarrowScreen(screen()).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));

    expect(plain.some(line => line.startsWith('LAST') && line.includes('sysop') && line.includes('145,387'))).toBe(true);
    expect(plain.some(line => line.startsWith('REC') && line.includes('sLASH') && line.includes('14,570,138'))).toBe(true);
  });

  it('does not fold the eighty-column drawing onto a C64', () => {
    const wideArt = ['#'.repeat(77)];
    const lines = renderNarrowScreen(screen(), { header: wideArt, tailer: [] });

    expect(lines.some(line => line.includes('#'.repeat(41)))).toBe(false);
  });
});
