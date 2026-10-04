/**
 * The last two parsers nobody had audited: Conf.DB and the node logs.
 *
 * Both were finished on paper and empty in practice.
 *
 * `parseConferenceDB` carried a `TODO: Parse binary structure` over a
 * hardcoded `accessLevel: 10`, so importing a board threw away every caller's
 * per-conference state and invented an access level AmiExpress does not have
 * (access is per USER - checkConfAccess, express.e:8499). Conf.DB is an array
 * of confBase records (axobjects.e:136-155): message pointer, ratio, byte
 * counters, scan flags, answered vote topics, one record per user slot.
 *
 * `parseCallersLog` demanded `DD-Mon-YYYY (HH:MM:SS)`, and then this port's own
 * `DD-Mon-YY HH:MM`. AmiExpress writes neither: displayUserToCallersLog
 * (express.e:16034-16042) stamps formatLongDate/formatLongTime, FORMAT_USA
 * (MiscFuncs.e:278-318), so a real line reads
 * `10-04-26 (17:37:02) [7] regress (CONNECT 19200) Test Account`.
 *
 * Conf.DB is the first eight records of this board's Conf2/Conf.DB, real
 * bytes. The CallersLog is in express.e's format (the same lines as
 * tests/fixtures/glc/CallersLog.express); this board's own logs held the
 * port's invented format until 2026-10-04.
 */
process.env.SKIP_DB_INIT = '1';

import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';
import { CONF_BASE_SIZE, parseConfDb } from '../../src/services/amiga-confbase';
import * as fs from 'fs';

const BOARD = path.join(__dirname, '..', 'fixtures', 'amiga-board');

describe('Conf.DB is per-user conference state', () => {
  test('a record is 74 bytes, which is what makes 74000 a thousand slots', () => {
    // axSetupTool creates the file as CONFDBSIZE=74000 zero bytes
    // (frmConfEdit.e:840-848), and every Conf.DB on this board is that size.
    expect(CONF_BASE_SIZE).toBe(74);
    expect(74000 % CONF_BASE_SIZE).toBe(0);
    expect(74000 / CONF_BASE_SIZE).toBe(1000);
  });

  test('reads one record per user slot, in slot order', async () => {
    const db = await new AmigaParserService()
      .parseConferenceDB(path.join(BOARD, 'Conf1'), 1);

    expect(db.userSlots).toBe(8);
    expect(db.userRecords?.map(r => r.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('keeps the message pointer, which is where a new-mail scan starts', async () => {
    const db = await new AmigaParserService()
      .parseConferenceDB(path.join(BOARD, 'Conf1'), 1);

    // Real values from this board: slot 1 had read up to 160, slot 2 to 10.
    expect(db.userRecords?.[1].confRead).toBe(160);
    expect(db.userRecords?.[2].confRead).toBe(10);
  });

  test('reads handle[] as the bit array it is, not as a name', () => {
    // express.e ORs the scan masks into byte 0 (22485-22499) and sets one bit
    // per answered vote topic above them (confbyte:=Shr(topicNum+3,3),
    // 21014). Read as text this field is a control character followed by
    // whatever the voting booth wrote.
    const buffer = fs.readFileSync(path.join(BOARD, 'Conf1', 'Conf.DB'));
    const [first] = parseConfDb(buffer);

    expect(first.zoomScan).toBe(true);
    expect(first.votedTopics).toContain(1);
    expect(first.votedTopics).toContain(25);
    expect(first.votedTopics).not.toContain(4);
  });

  test('does not claim a conference access level the board does not have', async () => {
    const db = await new AmigaParserService()
      .parseConferenceDB(path.join(BOARD, 'Conf1'), 1);

    // Per-user access rides in the records; the conference itself has none.
    expect(db.userRecords?.[0]).toHaveProperty('access');
  });

  test('a conference with no Conf.DB imports rather than throwing', async () => {
    const db = await new AmigaParserService()
      .parseConferenceDB(path.join(BOARD, 'Nope'), 7);

    expect(db.conferenceNumber).toBe(7);
    expect(db.userRecords).toBeUndefined();
  });
});

describe('the node logs a real board writes', () => {
  async function callersOfNode1() {
    const nodes = await new AmigaParserService().parseNodes(BOARD);
    const callers = nodes.find(n => n.nodeNumber === 1)?.callersLog;
    if (!callers) throw new Error('node 1 has no CallersLog');
    return callers;
  }

  test('reads every call out of a CallersLog, with its logoff', async () => {
    const callers = await callersOfNode1();
    expect(callers.map(c => [c.username, c.location, c.duration])).toEqual([
      ['CALLER2', 'Somewhere', 15],
      ['regress', 'Test Account', 4],
    ]);
  });

  test('reads MM-DD-YY (HH:MM:SS) in the right century', async () => {
    // "10-04-26" is formatLongDate's FORMAT_USA: October 4th. MiscFuncs.e:338
    // rebuilds the century as `IF days>=8035 THEN 20 ELSE 19`, so 26 is 2026.
    const [, call] = await callersOfNode1();
    expect(call.loginTime.getFullYear()).toBe(2026);
    expect(call.loginTime.getMonth()).toBe(9);
    expect(call.loginTime.getDate()).toBe(4);
    expect([call.loginTime.getHours(), call.loginTime.getMinutes(), call.loginTime.getSeconds()]).toEqual([17, 37, 2]);
  });

  test('the node is the directory the log is in; `[n]` is the account, and CONNECT gives the baud', async () => {
    const [, call] = await callersOfNode1();
    expect(call.node).toBe(1);
    expect(call.baud).toBe(19200);
  });
});
