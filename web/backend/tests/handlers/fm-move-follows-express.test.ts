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
  // A DIR file runs oldest first (an upload is appended), and express.e
  // inserts before the first entry dated the same or later
  // (`brk:=(d2>=d1)`, express.e:27211). The earlier port inserted before the
  // first OLDER entry, which put a moved file at the top of the listing.
  it('puts it before the first entry dated the same or later', () => {
    const dest = [
      dirLine('OLDEST.LHA', '01-01-10'),
      dirLine('OLDER.LHA', '01-01-20'),
      dirLine('NEWEST.LHA', '06-01-26'),
    ];
    const entry = [dirLine('MOVED.LHA', '03-01-24')];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[2]).toContain('MOVED.LHA');
    expect(merged[3]).toContain('NEWEST.LHA');
    expect(merged).toHaveLength(4);
  });

  it('keeps a multi-line entry together', () => {
    // A description runs on past the header line; both must move as a block.
    const dest = [dirLine('NEW.LHA', '06-01-26')];
    const entry = [dirLine('MOVED.LHA', '03-01-24'), '                                       second line'];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[0]).toContain('MOVED.LHA');
    expect(merged[1]).toContain('second line');
    expect(merged[2]).toContain('NEW.LHA');
  });

  it('appends when every entry in the destination is older', () => {
    const dest = [dirLine('OLD.LHA', '01-01-90')];
    const entry = [dirLine('RECENT.LHA', '06-01-26')];

    const merged = handler.spliceByDate(dest, entry);

    expect(merged[merged.length - 1]).toContain('RECENT.LHA');
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

describe('the bytes follow the entry', () => {
  // express.e:27256-27340 moves the file into ULPATH.1 of the DESTINATION
  // conference. The port looked up the source conference's upload path, so
  // a move into another conference left the bytes where a download from the
  // destination never looks (parity survey, 2026-09-29). And a file it could
  // not find was silently not moved while both listings were rewritten;
  // express.e says "Move operation failed" and leaves them alone (27358).
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const { setFileMaintenanceDependencies } = require('../../src/handlers/file/file-maintenance.handler');

  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-move-bytes-'));
    for (const conf of ['Conf1', 'Conf2']) fs.mkdirSync(path.join(root, conf, 'Files'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'MOVE.LHA'), 'THE BYTES');
    fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), [dirLine('MOVE.LHA', '03-01-24'), dirLine('STAY.LHA', '04-01-24')].join('\n'));
    fs.writeFileSync(path.join(root, 'Conf2', 'DIR1'), dirLine('THERE.LHA', '01-01-20'));
    setFileMaintenanceDependencies({ db: undefined, config: { get: (key: string) => (key === 'dataDir' ? root : undefined) } });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function context(filename: string) {
    return {
      dirFilePath: path.join(root, 'Conf1', 'DIR1'),
      dirNum: 1,
      maxDirs: 1,
      destMaxDirs: 1,
      currentFile: { filename, lineNumber: 0, rawLines: [dirLine(filename, '03-01-24')] },
    };
  }

  function caller() {
    const out: string[] = [];
    const socket: any = { emit: (event: string, data?: unknown) => { if (event === 'ansi-output') out.push(String(data)); } };
    const session: any = { currentConf: 1, nodeId: 1, user: { id: 1, username: 'sysop' } };
    return { socket, session, said: () => out.join('') };
  }

  it('lands in the destination conference, where D looks for it', async () => {
    const c = caller();
    await handler.performMove(c.socket, c.session, context('MOVE.LHA'), 1, 2);

    expect(fs.readFileSync(path.join(root, 'Conf2', 'Upload', 'MOVE.LHA'), 'utf8')).toBe('THE BYTES');
    expect(fs.existsSync(path.join(root, 'Conf1', 'Files', 'MOVE.LHA'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1')).toContain('MOVE.LHA');
    expect(fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1')).not.toContain('MOVE.LHA');
  });

  it('a file that is not there moves nothing, listings included', async () => {
    const c = caller();
    const before1 = fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1');
    const before2 = fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1');
    await handler.performMove(c.socket, c.session, context('GHOST.LHA'), 1, 2);

    expect(c.said()).toContain('Could not move GHOST.LHA');
    expect(fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1')).toBe(before1);
    expect(fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1')).toBe(before2);
  });
});
