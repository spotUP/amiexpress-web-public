/**
 * THE 80-COLUMN SCREEN IS PINNED TO THE 68K DOOR'S OWN OUTPUT.
 *
 * `ctop-68k-80col.capture` is the wire, byte for byte, from running the real
 * `Doors/Conftop/ctop` binary through the board's emulator on 2026-09-22:
 *
 *   cd web/backend && SKIP_DB_INIT=1 npx tsx src/scripts/run-amiga-door.ts \
 *     <repo>/Doors/Conftop/ctop 1 --doortype XIM --timeout 45 --command CTOP
 *
 * It was taken against this repository's `Conf1` - DeaTure holding the record
 * with 2,020,282,473 bytes over 61 files, nobody having uploaded in the
 * current period, `SKIP_EMPTY_LINES` set - and the TypeScript door must
 * reproduce it exactly. Not "look the same": the same bytes, because a
 * caller who has read this table for years reads it by the column the totals
 * end in, and the conference name field is forty columns whether anyone
 * remembers why or not.
 *
 * A capture rather than my reading of `ctop.e` because two of the things a
 * port gets wrong are invisible in the source: the banner is drawn TWICE and
 * only the second draw clears the screen, and every non-empty line leaves the
 * wire with a reset the templates do not contain.
 */
import * as fs from 'fs';
import * as path from 'path';

import { decodeCtopFile } from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import {
  renderWideScreen,
  type CtopScreen,
} from '../../../../../Doors/ctop-viewer/src/wide';

const CAPTURE = fs.readFileSync(path.join(__dirname, 'ctop-68k-80col.capture'), 'latin1');

/** The Conf1 the capture was taken against, as bytes. */
function conf1(): Buffer {
  const buf = Buffer.alloc(96);
  buf.writeInt32BE(17797, 0);            // resetDate
  buf.writeInt32BE(17790, 4);            // startDate
  buf.write('DeaTure', 8, 'latin1');
  Buffer.from([0x00, 0x00, 0x00, 0x20, 0x20, 0x28, 0x24, 0x73]).copy(buf, 40);
  buf.writeInt32BE(61, 48);
  buf.write('NONE', 52, 'latin1');
  return buf;
}

function screen(): CtopScreen {
  return {
    period: decodeCtopFile(conf1()),
    conferenceName: 'Lamer Zone',
    today: 17796,
    rows: 12,
    skipEmpty: true,
    minLimit: 0n,
    showResetDate: false,
  };
}

describe('the eighty-column screen', () => {
  it('is the 68K door\'s wire, byte for byte', () => {
    const wire = renderWideScreen(screen(), { header: [], tailer: [] })
      .map(line => line + '\r\n')
      .join('');

    expect(wire).toBe(CAPTURE);
  });
});

describe('a conference with uploaders in it', () => {
  /*
   * The capture's conference is empty, so the ROW template has no proof in
   * it. The column rule does: `===-=======================-...` is in the
   * capture and its segments are the row's fields - 3, 23, 24, 5, 18, with a
   * separator between each. A row that does not line up with the rule above
   * it is the only way this table can be wrong.
   */
  const RULE_SEGMENTS = [3, 23, 24, 5, 18];

  function rowFor(files: number, bytes: bigint): string {
    const records = [];
    for (let i = 0; i < files; i++) {
      records.push(Buffer.alloc(66));
    }
    const buf = Buffer.concat([conf1(), ...records]);
    // One uploader, one row: name and location written into every record.
    for (let i = 0; i < files; i++) {
      const at = 96 + i * 66;
      buf.write('sLASH', at, 'latin1');
      buf.write('Server Room', at + 32, 'latin1');
      buf.writeInt32BE(Number(bytes) / files, at + 62);
    }
    const lines = renderWideScreen(
      { ...screen(), period: decodeCtopFile(buf) },
      { header: [], tailer: [] },
    );
    return lines.find(line => line.includes('sLASH')) ?? '';
  }

  it('lines its columns up with the rule above them', () => {
    const row = rowFor(2, 82_104n).replace(/\x1b\[[0-9;]*m/g, '');
    const rule = CAPTURE.split('\r\n')
      .find(line => line.includes('===-'))!
      .replace(/\x1b\[[0-9;]*m/g, '');

    expect(row.length).toBe(rule.length);
    let at = 0;
    for (const width of RULE_SEGMENTS) {
      // Every separator in the rule is a `-`, and the row has a space there.
      const end = at + width;
      if (end < rule.length) {
        expect(rule[end]).toBe('-');
        expect(row[end]).toBe(' ');
      }
      at = end + 1;
    }
  });

  it('writes the number, the name, the files and the bytes where they belong', () => {
    const row = rowFor(2, 82_104n).replace(/\x1b\[[0-9;]*m/g, '');

    expect(row.slice(0, 4)).toBe(' 1. ');
    expect(row.slice(4, 27)).toBe('sLASH'.padEnd(23));
    expect(row.slice(28, 52)).toBe('Server Room'.padEnd(24));
    expect(row.slice(53, 58)).toBe('    2');
    expect(row.slice(59)).toBe('82,104'.padStart(18));
  });
});

describe('an empty conference the sysop wants padded', () => {
  it('says so halfway down the table', () => {
    const lines = renderWideScreen(
      { ...screen(), skipEmpty: false },
      { header: [], tailer: [] },
    );

    const numbered = lines.filter(line => /^\x1b\[32m\s*\d+\./.test(line));
    expect(numbered).toHaveLength(12);
    expect(numbered[5]).toContain('- NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -');
    expect(numbered[0]).not.toContain('NO UPLOADERS');
  });
});

describe('a caller with more than eighty columns', () => {
  /*
   * The third screen the board owes every door. The Amiga table was frozen at
   * seventy-seven columns and cut a 30-character group name down to 24 on a
   * 132-column terminal for no reason but the constant; the surplus goes to
   * the two fields that were being cut.
   */
  const LONG = {
    userName: 'A-HANDLE-THAT-IS-LONGER-THAN-TWENTY-THREE',
    location: 'A LOCATION LONGER THAN TWENTY-FOUR COLUMNS',
    bytes: 1_000n,
    files: 1,
  };

  function wideScreen(columns: number): string[] {
    const period = decodeCtopFile(conf1());
    period.uploaders.push({ ...LONG });
    return renderWideScreen({ ...screen(), period }, { header: [], tailer: [] }, columns);
  }

  it('gets a wider table, not the same one with space beside it', () => {
    const at80 = wideScreen(80).find(line => line.includes('==='))!.replace(/\x1b\[[0-9;]*m/g, '');
    const at132 = wideScreen(132).find(line => line.includes('==='))!.replace(/\x1b\[[0-9;]*m/g, '');

    expect(at80.length).toBe(77);
    expect(at132.length).toBe(129);
  });

  it('spends the surplus on the names it was cutting off', () => {
    const at132 = wideScreen(132).find(line => line.includes('A-HANDLE'))!.replace(/\x1b\[[0-9;]*m/g, '');

    expect(at132).toContain(LONG.userName);
    expect(at132).toContain(LONG.location);
  });

  it('never paints wider than the caller said his screen is', () => {
    // Every CSI sequence, not just the colours: the second banner clears the
    // screen, and `ESC[2J ESC[H` is seven bytes that take no columns.
    const printable = (line: string): number => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
    for (const columns of [80, 100, 132, 200]) {
      for (const line of wideScreen(columns)) {
        expect(printable(line)).toBeLessThanOrEqual(columns);
      }
    }
  });
});
