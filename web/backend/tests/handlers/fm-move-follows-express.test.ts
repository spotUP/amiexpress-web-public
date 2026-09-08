/**
 * FM's Move, which diverged from express.e at every step of the sub-flow.
 *
 * express.e:27087 maintenanceFileMove():
 *   1. getMoveConf() asks for a destination CONFERENCE, with `L` to list and
 *      an empty answer to abandon (express.e:27019-27049).
 *   2. `Directory to move to: (1-N), (A)uto, (Enter)=abort? `, where N is the
 *      DESTINATION conference's NDIRS (express.e:27111-27115).
 *   3. `(A)uto` walks that conference's directories from the top down and
 *      takes the first whose newest entry is not newer than the file
 *      (express.e:27121-27138).
 *   4. The entry is spliced into the destination listing at its date position
 *      (express.e:27196-27230).
 *
 * This port asked only "Enter destination directory number:", moved within
 * `session.currentConf` - so a cross-conference move, which is most of what FM
 * Move is for, could not be expressed at all - had no (A)uto, and appended the
 * entry to the end of the destination listing.
 */
process.env.SKIP_DB_INIT = '1';

import { FileMaintenanceHandler } from '../../src/handlers/file/file-maintenance.handler';

const handler = FileMaintenanceHandler as any;

/** `filename(12) + status + size + mm-dd-yy + description`, as the board writes it. */
function dirLine(name: string, date: string): string {
  return `${name.padEnd(12).slice(0, 12)} N  123456  ${date}         a file`;
}

describe('express\'s date comparison', () => {
  it('orders two mm-dd-yy stamps the way getDateCompareVal does', () => {
    // year*10000 + month*100 + day (MiscFuncs.e:422-436).
    expect(handler.dateCompareValue('03-28-18')).toBe(20180328);
    expect(handler.dateCompareValue('12-01-99')).toBe(19991201);
  });

  it('uses express\'s century pivot of 77, not the usual 80', () => {
    // axconsts.e:41 TWODIGITYEARSWITCHOVER=77, MiscFuncs.e:434.
    expect(handler.dateCompareValue('01-01-78')).toBe(19780101);
    expect(handler.dateCompareValue('01-01-77')).toBe(20770101);
  });

  it('reads the date out of a real DIR line', () => {
    expect(handler.dateOfDirLine(dirLine('PARTY.LHA', '05-06-07'))).toBe('05-06-07');
  });

  it('finds no date in a description continuation line', () => {
    expect(handler.dateOfDirLine('                                       more words')).toBe('');
  });
});

describe('splicing a moved entry into the destination listing', () => {
  it('puts it before the first OLDER entry, not at the end', () => {
    const dest = [
      dirLine('NEWEST.LHA', '06-01-26'),
      dirLine('OLDER.LHA', '01-01-20'),
      dirLine('OLDEST.LHA', '01-01-10'),
    ];
    const entry = [dirLine('MOVED.LHA', '03-01-24')];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[1]).toContain('MOVED.LHA');
    expect(merged).toHaveLength(4);
  });

  it('keeps a multi-line entry together', () => {
    // A description runs on past the header line; both must move as a block.
    const dest = [dirLine('OLD.LHA', '01-01-10')];
    const entry = [dirLine('MOVED.LHA', '03-01-24'), '                                       second line'];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[0]).toContain('MOVED.LHA');
    expect(merged[1]).toContain('second line');
    expect(merged[2]).toContain('OLD.LHA');
  });

  it('appends when every entry in the destination is newer', () => {
    const dest = [dirLine('NEW.LHA', '06-01-26')];
    const entry = [dirLine('ANCIENT.LHA', '01-01-90')];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[merged.length - 1]).toContain('ANCIENT.LHA');
  });

  it('appends into an empty destination without losing the entry', () => {
    expect(handler.spliceByDate([], [dirLine('ONLY.LHA', '01-01-20')])).toHaveLength(1);
  });

  it('appends an entry that carries no readable date at all', () => {
    const dest = [dirLine('NEW.LHA', '06-01-26')];

    const merged = handler.spliceByDate(dest, ['a line with no date']);

    expect(merged[merged.length - 1]).toBe('a line with no date');
  });
});

describe('the destination conference step', () => {
  function socket() {
    const out: string[] = [];
    return {
      out,
      emit: (event: string, data?: unknown) => { if (event === 'ansi-output') out.push(String(data)); },
    } as any;
  }

  function session(): any {
    return {
      currentConf: 1,
      user: { username: 'sysop', securityLevel: 255, confAccess: 'XXXXX' },
      tempData: { fmContext: { maxDirs: 4, matchPos: 0, nextPos: 1 } },
      subState: '',
    };
  }

  it('asks for a conference before it asks for a directory', async () => {
    const s = socket();
    const sess = session();

    await handler.promptMoveDestination(s, sess);

    expect(s.out.join('')).toContain('Conference Number to move to (L to List):');
    expect(sess.subState).toBe('fm_move_conf_input');
  });

  it('abandons the move on an empty answer, as express does', async () => {
    // express.e:27028 - `IF StrLen(destConfStr)=0 THEN RETURN`, not an error.
    const sess = session();
    handler.afterAction = jest.fn(async () => undefined);

    await handler.handleMoveConfInput(socket(), sess, '');

    expect(handler.afterAction).toHaveBeenCalled();
  });

  it('lists the conferences for L and asks again', async () => {
    const s = socket();
    const sess = session();

    await handler.handleMoveConfInput(s, sess, 'L');

    const text = s.out.join('');
    expect(text).toContain('Conference List');
    expect(text).toContain('Conference Number to move to (L to List):');
    expect(sess.subState).toBe('fm_move_conf_input');
  });
});
