/**
 * Bulls.CFG must carry one mask row per conference, in order.
 *
 * "[NO CONF] No mask row for Conference 9 ... this should not be possible"
 * (sysop, 2026-09-14, from the admin's own Bulls menu editor).
 *
 * He was right, and the editor was right to flag it. The file had 39 rows
 * where there are 40 conferences: the rows ran 1-8 and then 10, with no row 9
 * at all. A real Amiga binary reads this file BY POSITION - the `; Conference
 * N` on the end is a comment - so the ninth row it read was the mask written
 * for conference 10, and every conference from 9 up was answering with its
 * neighbour's bulletin access.
 *
 * It was committed that way, so the editor did not cause it and no amount of
 * saving would have. This asks the file itself, which is the only thing that
 * could have caught it.
 *
 * The bulletin NAMES had the same shape of fault: the `; bullN.txt` comments
 * ran 1..12, 12, 13..19 across twenty rows, so from row 13 the documentation
 * named the file before the one the row actually maps to.
 */
import * as fs from 'fs';
import * as path from 'path';

const CFG = path.resolve(__dirname, '..', '..', '..', '..', 'board', 'Doors', 'emp_tools', 'Bulls.CFG');

/** Every `; Conference N` row, in the order the door reads them. */
function maskRows(): Array<{ mask: string; labelled: number }> {
  return fs.readFileSync(CFG, 'latin1').split(/\r?\n/)
    .map(line => /^(\S+)\s+; Conference (\d+)\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ mask: m[1], labelled: parseInt(m[2], 10) }));
}

/** Every `; bullN.txt` name row, in order. */
function nameRows(): number[] {
  return fs.readFileSync(CFG, 'latin1').split(/\r?\n/)
    .map(line => /; bull(\d+)\.txt\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => parseInt(m[1], 10));
}

describe('the conference masks', () => {
  it('has a row for all forty conferences', () => {
    expect(maskRows()).toHaveLength(40);
  });

  it('is in order, with no conference skipped', () => {
    // POSITION is what the door reads; the label only has to agree with it.
    // A gap shifts every conference below it onto the wrong mask, silently.
    expect(maskRows().map(r => r.labelled)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
  });

  it('gives every row exactly twenty bulletin flags', () => {
    // Collected rather than asserted one at a time: a failure should name
    // WHICH conference is malformed, and jest's expect takes no message.
    const wrong = maskRows()
      .filter(row => !/^[X-]{20}$/.test(row.mask))
      .map(row => `Conference ${row.labelled}: ${JSON.stringify(row.mask)}`);

    expect(wrong).toEqual([]);
  });
});

describe('the bulletin names', () => {
  // The sysop edits this file on the live board through the admin's Bulls
  // editor and trims unused rows, so the count follows the board: at least
  // one, and never more than the twenty flags a mask row carries - a 21st
  // name has no flag to switch it on in any conference.
  it('names no more bulletins than a mask row has flags', () => {
    expect(nameRows().length).toBeGreaterThan(0);
    expect(nameRows().length).toBeLessThanOrEqual(20);
  });

  it('names them in order, each row the bulletin it maps to', () => {
    expect(nameRows()).toEqual(Array.from({ length: nameRows().length }, (_, i) => i + 1));
  });
});
