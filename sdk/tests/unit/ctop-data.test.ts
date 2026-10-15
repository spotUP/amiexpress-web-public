/**
 * THE FORMAT IS READ FROM THE BOARD'S OWN BYTES, NOT FROM MY READING OF THE
 * SOURCE.
 *
 * `sdk/tests/fixtures/ctop/conf1-live.data` is a copy of
 * `Conf1/ctop.data` taken off the live volume on 2026-09-22: 294 bytes, a
 * 96-byte header and three upload records, every one of them written by the
 * Amiga door and by the board's upload path. A decoder checked against a
 * fixture I built myself would only prove I can read what I wrote - this one
 * has a name with mixed case in it, a location with backslashes, and a period
 * total that is much smaller than the all-time total, all of which are
 * positions in the header a four-byte mistake would silently swap.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  CTOP_HEADER_SIZE,
  CTOP_RECORD_SIZE,
  aggregateCtop,
  amigaDayOfMonth,
  amigaDayOfWeek,
  bcdToBigInt,
  bigIntToBcd,
  decodeCtopFile,
  decodeCtopHeader,
  decodeCtopRecords,
  encodeCtopHeader,
  encodeCtopRecord,
  formatCtopBytes,
  fromAmigaDays,
  toAmigaDays,
} from '../../formats/ctop-data';

const LIVE = fs.readFileSync(path.join(__dirname, '../fixtures/ctop/conf1-live.data'));

describe('the live conference file', () => {
  it('is a header and three records', () => {
    expect(LIVE.length).toBe(CTOP_HEADER_SIZE + 3 * CTOP_RECORD_SIZE);
  });

  it('decodes the header the Amiga wrote', () => {
    const header = decodeCtopHeader(LIVE);

    expect(header.resetDate).toBe(17795);
    expect(header.startDate).toBe(17788);
    expect(header.topUpName).toBe('sLASH');
    expect(header.topUpBytes).toBe(14_570_138n);
    expect(header.topUpFiles).toBe(5);
    expect(header.periodUpName).toBe('sysop');
    expect(header.periodUpBytes).toBe(145_387n);
    expect(header.periodUpFiles).toBe(7);
  });

  it('decodes the uploads, locations and all', () => {
    expect(decodeCtopRecords(LIVE)).toEqual([
      { userName: 'sysop', location: 'Server Room', bytes: 46_336 },
      { userName: 'sysop', location: 'Server Room', bytes: 35_769 },
      { userName: 'EALL/HT', location: '\\o/ HACK N TRADE \\o/', bytes: 49_246 },
    ]);
  });

  it('adds one caller up once, and sorts by bytes', () => {
    const period = decodeCtopFile(LIVE);

    expect(period.uploaders).toEqual([
      { userName: 'sysop', location: 'Server Room', bytes: 82_105n, files: 2 },
      { userName: 'EALL/HT', location: '\\o/ HACK N TRADE \\o/', bytes: 49_246n, files: 1 },
    ]);
    expect(period.totalFiles).toBe(3);
    expect(period.totalBytes).toBe(131_351n);
  });

  it('survives a file cut short mid-record', () => {
    const cut = LIVE.subarray(0, LIVE.length - 20);

    expect(decodeCtopRecords(cut)).toHaveLength(2);
  });

  it('round-trips through the encoder byte for byte', () => {
    const header = decodeCtopHeader(LIVE);
    const records = decodeCtopRecords(LIVE);
    const rebuilt = Buffer.concat([encodeCtopHeader(header), ...records.map(encodeCtopRecord)]);

    expect(rebuilt.equals(LIVE)).toBe(true);
  });
});

describe('the packed-decimal totals', () => {
  it('carry more digits than a long, which is why they exist', () => {
    const huge = 9_999_999_999_999_999n;

    expect(bcdToBigInt(bigIntToBcd(huge))).toBe(huge);
  });

  it('are eight bytes, two digits each', () => {
    expect([...bigIntToBcd(14_570_138n)]).toEqual([0, 0, 0, 0, 0x14, 0x57, 0x01, 0x38]);
  });

  it('are written with separators, as the door writes them', () => {
    expect(formatCtopBytes(14_570_138n)).toBe('14,570,138');
    expect(formatCtopBytes(0n)).toBe('0');
    expect(formatCtopBytes(999n)).toBe('999');
    expect(formatCtopBytes(1_000n)).toBe('1,000');
  });
});

describe('Amiga day numbers', () => {
  it('count from 1978-01-01', () => {
    expect(toAmigaDays(new Date(Date.UTC(1978, 0, 1)))).toBe(0);
    // The live file's resetDate, which is a Monday - the weekly period the
    // sysop configured with DAYS=WEEKLY always ends on one.
    expect(fromAmigaDays(17795).toISOString().slice(0, 10)).toBe('2026-09-21');
    expect(amigaDayOfWeek(17795)).toBe(1);
  });

  it('name Monday 1 and Sunday 7', () => {
    // 1978-01-02 was a Monday.
    expect(amigaDayOfWeek(1)).toBe(1);
    expect(amigaDayOfWeek(7)).toBe(7);
    expect(amigaDayOfMonth(0)).toBe(1);
  });
});

describe('a name that fills its field', () => {
  it('is not truncated by a terminator it does not have', () => {
    const name = 'X'.repeat(32);
    const header = decodeCtopHeader(encodeCtopHeader({
      resetDate: 1, startDate: 0,
      topUpName: name, topUpBytes: 1n, topUpFiles: 1,
      periodUpName: 'NONE', periodUpBytes: 0n, periodUpFiles: 0,
    }));

    expect(header.topUpName).toBe(name);
  });
});

describe('two uploaders on the same byte count', () => {
  it('keep the order the file has them in', () => {
    const header = decodeCtopHeader(Buffer.alloc(CTOP_HEADER_SIZE));
    const period = aggregateCtop(header, [
      { userName: 'first', location: 'a', bytes: 100 },
      { userName: 'second', location: 'b', bytes: 100 },
    ]);

    expect(period.uploaders.map(u => u.userName)).toEqual(['first', 'second']);
  });
});
