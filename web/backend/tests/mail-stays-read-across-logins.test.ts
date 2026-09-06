/**
 * The sysop, 2026-09-06: "a message sent to me is flagged UNREAD at every
 * login." His instance is Conf1 message 13, `E2E Test Message`, status R
 * (private), toName `sysop`.
 *
 * THREE separate defects produce that one sentence. This file pins the one
 * that is fixed and marks the two that are not, so nobody has to find them
 * again.
 *
 * (1) FIXED HERE - the received flag could not be written at all.
 *     express.e:8941-8948: displaying a message whose toName is the caller's
 *     conference mail name sets `mailHeader.recv := getSystemTime()` and
 *     `saveOverHeader(gfh)`. This port does the same through
 *     `markMessageReceived` -> `messageIndexManager.updateMessageHeader`,
 *     which re-serialises EVERY header in the conference, not only the one
 *     that changed. serializeMsgHeader wrote msgNumb/msgDate/recv with
 *     writeInt32BE while amiga-msgheader.ts reads them with readUInt32BE, and
 *     Conf1/MsgBase/HeaderFile records 319, 320 and 321 - the three records
 *     immediately AFTER the sysop's message 13 - carry recv values of
 *     2404384768, 3062235136 and 2152529920. Every write threw a RangeError
 *     before a byte reached the file, and messaging.handler.ts:490 swallows it
 *     in a `.catch` while setting `msg.receivedAt` in memory anyway: the
 *     session looked right, the disk still said recv=0.
 *
 * (2) FIXED - `countNewMessages` produced the NUMBER the caller is told and
 *     never looked at `recv`, while `getMessagesForConfScan` produced the
 *     LIST he is given and did. The reader correctly stopped offering a
 *     message that had been read while the count went on announcing it. Both
 *     are one walk now, `scanConferenceForNewMail`, over one predicate,
 *     `isNewMailFor` (express.e:11706), with newPrivate derived from the
 *     matched list.
 *
 * (3) NOT FIXED, and not reachable from a unit test - Conf1's
 *     MsgBase/MailStats says highMsgNum=151 while its HeaderFile holds
 *     message numbers up to 318. A scan stores lastNewReadConf=318, and the
 *     next login's `validatePointers` (message-pointers.util.ts, express.e:
 *     5040-5049) sees 318 > 151 and resets the pointer to lowestKey=1. The
 *     clamp is correct parity; the input data is wrong, so the whole
 *     conference re-enters the scan window at every login. The repair is
 *     `rebuildHeaders` / the admin's repair-headers endpoint, on the live
 *     board's data.
 */

process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ScanFlags } from '../src/types/message-pointers';

jest.mock('../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(),
}));
jest.mock('../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn(),
  runSystemCommand: jest.fn(),
}));

/** The value Conf1's record 319 carries in `recv` on this board. */
const POISONED_RECV = 2404384768;

/** The sysop's message, and the poisoned record sitting next to it. */
const MINE = 2;
const NEIGHBOUR = 1;

describe('mail the sysop has read stays read', () => {
  let db: any;
  let sysop: any;
  let originalBbsRoot: string | undefined;
  let originalDataDir: string | undefined;
  let tmpRoot: string;

  beforeAll(async () => {
    db = (global as any).testDb;
    if (!db) throw new Error('Test database not initialized');
    sysop = await db.getUserByUsername('sysop');
    if (!sysop) throw new Error('sysop user missing');
    originalBbsRoot = process.env.BBS_ROOT;
    originalDataDir = process.env.BBS_DATA_DIR;
  });

  afterEach(() => {
    jest.resetModules();
    process.env.BBS_ROOT = originalBbsRoot;
    if (originalDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = originalDataDir;
    jest.restoreAllMocks();
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** A one-conference board: mail for the sysop, beside a poisoned record. */
  function setUpBoard() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-mail-read-'));
    // BOTH roots. messageIndexManager resolves its HeaderFile from BBS_ROOT,
    // and `config.get('dataDir')` - which messageFileExists uses to look for
    // the body file - reads BBS_DATA_DIR and otherwise defaults to the REPO
    // ROOT. Set only BBS_ROOT and the scan reads headers from the temp board
    // while testing for bodies in the developer's own Conf1/MsgBase, so the
    // suite passes or fails on which files that machine happens to have.
    process.env.BBS_ROOT = tmpRoot;
    process.env.BBS_DATA_DIR = tmpRoot;
    jest.resetModules();

    const tooltypes = require('../src/utils/conference-tooltypes.util');
    (tooltypes.getConferenceToolFlags as jest.Mock).mockImplementation(() => ({
      forceNewscan: false, noNewscan: false, showNewFiles: false,
      noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
    }));

    const { messageIndexManager, MsgStatus } = require('../src/services/MessageIndexManager');
    const { performConferenceScan, setMessageScanDependencies } = require('../src/handlers/message/message-scan.handler');
    const { markMessageReceived } = require('../src/utils/message-file.util');

    setMessageScanDependencies(
      db, jest.fn(), jest.fn(), jest.fn(), jest.fn(),
      [{ id: 1, name: 'Conf1' }],
      [{ id: 1, conferenceId: 1, name: 'General' }],
    );

    messageIndexManager.initializeMessageIndex(1);

    // The neighbour. Nobody scans it - it is not addressed to the sysop - it
    // only has to be in the file when the file is rewritten.
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE, msgNumb: NEIGHBOUR,
      toName: '@C_BELCHNET', fromName: 'sysop', subject: 'g',
      msgDate: 27157, recv: POISONED_RECV, extMsgNum: 0,
    });
    // The sysop's own mail, unread.
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE, msgNumb: MINE,
      toName: 'SYSOP', fromName: 'ALICE', subject: 'Private',
      msgDate: 0, recv: 0, extMsgNum: 0,
    });

    // A header with no body file is skipped by the scan
    // (message-scan.handler.ts:281, messageFileExists).
    const msgBase = path.join(tmpRoot, 'Conf1', 'MsgBase');
    fs.mkdirSync(msgBase, { recursive: true });
    for (const n of [NEIGHBOUR, MINE]) {
      fs.writeFileSync(path.join(msgBase, String(n)), 'body\r\n', 'latin1');
    }

    return { messageIndexManager, performConferenceScan, markMessageReceived };
  }

  /**
   * One login's mail scan. The pointer is put back to 0 each time on purpose:
   * defect (3) above does exactly that on the live board, and it isolates the
   * question this file is about - what `recv` alone is worth.
   */
  async function login(performConferenceScan: any) {
    await db.run(
      `INSERT OR IGNORE INTO conf_base (user_id, conference_id, message_base_id, scan_flags)
       VALUES (?, 1, 1, ?)`,
      [sysop.id, ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN],
    );
    await db.run(
      `UPDATE conf_base SET last_new_read_conf = 0, last_msg_read_conf = 0, scan_flags = ?
       WHERE user_id = ? AND conference_id = 1 AND message_base_id = 1`,
      [ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN, sysop.id],
    );

    const socket = { emit: jest.fn() };
    const session: any = {
      user: { ...sysop, confAccess: 'X' }, currentConf: 1,
      lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0, tempData: {},
    };
    await performConferenceScan(socket, session);
    return {
      offered: (session.tempData?.confScanState?.pendingMessages ?? []).map((m: any) => m.msgNum),
      counted: session.lastScanNewPrivate,
    };
  }

  test('a message stays read after logging out and back in', async () => {
    const { performConferenceScan, markMessageReceived } = setUpBoard();

    // First login: the reader is offered the sysop's message.
    expect((await login(performConferenceScan)).offered).toEqual([MINE]);

    // He opens it. This is the call displaySingleMessage makes at
    // messaging.handler.ts:490.
    await markMessageReceived(1, MINE, process.env.BBS_ROOT as string);

    // Second login: the scan reads the HeaderFile off disk again and must not
    // put the message back in front of him.
    expect((await login(performConferenceScan)).offered).toEqual([]);
  });

  /**
   * Was defect (2), fixed: `countNewMessages` never consulted `recv`, so the
   * caller was still told he had one new private message with nothing behind
   * it. There is one walk and one predicate now - `isNewMailFor` - and
   * `newPrivate` is `messages.filter(isPrivate).length`, so the number and
   * the list cannot disagree by construction.
   */
  test('and the login stops saying there is one', async () => {
    const { performConferenceScan, markMessageReceived } = setUpBoard();

    await login(performConferenceScan);
    await markMessageReceived(1, MINE, process.env.BBS_ROOT as string);

    expect((await login(performConferenceScan)).counted).toBe(0);
  });

  test('the recv it wrote is on disk, not only in the session', async () => {
    const { messageIndexManager, markMessageReceived } = setUpBoard();

    await markMessageReceived(1, MINE, process.env.BBS_ROOT as string);

    const headers = messageIndexManager.readHeaderFile(1);
    expect(headers.find((h: any) => h.msgNumb === MINE).recv).toBeGreaterThan(0);
    // And the poisoned neighbour it had to rewrite came through unchanged.
    expect(headers.find((h: any) => h.msgNumb === NEIGHBOUR).recv).toBe(POISONED_RECV);
  });

  test('marking one message read does not throw on its poisoned neighbour', async () => {
    const { markMessageReceived } = setUpBoard();

    // messaging.handler.ts:490 swallows this in a .catch, which is how the
    // failure stayed invisible for as long as it did.
    await expect(markMessageReceived(1, MINE, process.env.BBS_ROOT as string)).resolves.toBeUndefined();
  });
});
