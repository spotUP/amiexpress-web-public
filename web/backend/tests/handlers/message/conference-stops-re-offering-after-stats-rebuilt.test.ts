/**
 * A conference whose MailStats have fallen behind its HeaderFile puts every
 * message back in the caller's new-mail window at EVERY login.
 *
 * The mechanism, and why the clamp is not the bug:
 *
 *   express.e:11666  IF(mailStat.highMsgNum<lastNewReadConf)
 *                      THEN lastNewReadConf:=mailStat.lowestKey
 *   express.e:5045-5049 does the same on joinConf.
 *
 * `highMsgNum` is the number express.e will give the NEXT message
 * (express.e:10688 `mh.msgNumb:=mailStat.highMsgNum`, bumped by
 * express.e:12418 after each save), so a pointer can never legitimately run
 * past it. When it does, the message base has been packed and the clamp is
 * correct parity - it rewinds the caller to `lowestKey`.
 *
 * On this board it fired for a different reason: MailStats had gone stale
 * while the HeaderFile kept growing, so the clamp fired on healthy data.
 * The sysop saw it on two conferences on 2026-09-06 - conference 1 said
 * highMsgNum=151 against headers up to 318, conference 3 said highMsgNum=1
 * against 18 records numbered 1..18 - and both were repaired the same way,
 * by re-deriving the stats from the headers already on disk:
 * `rebuildHeaders(conf, readHeaderFile(conf))`.
 *
 * This pins the OUTCOME rather than the sysop's data: the fixture below is a
 * board built from scratch with the same shape - headers past a stale
 * `highMsgNum` - so it goes on holding after his message base changes.
 *
 * Both BBS_ROOT and BBS_DATA_DIR are set to the temp board on purpose.
 * `messageIndexManager` resolves the HeaderFile against BBS_ROOT while the
 * scan finds message BODIES through `config.get('dataDir')`, which reads
 * BBS_DATA_DIR. Setting only one of them reads the headers from the fixture
 * and looks for the bodies in the real checkout, and every message is then
 * skipped as body-less.
 */

process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ScanFlags } from '../../../src/types/message-pointers';

jest.mock('../../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(),
}));
jest.mock('../../../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn(),
  runSystemCommand: jest.fn(),
}));
/*
 * When a scan finds nothing, finishConferenceScan hands control back through
 * `require('../command.handler')` (message-scan.handler.ts:486, and
 * conference.handler.ts:414/476 do the same). That module graph reaches
 * src/index.ts, which starts the heartbeat and connection-cleanup
 * `setInterval`s at load - live timers that keep the jest worker alive long
 * after the suite has passed, so the whole run hangs instead of exiting.
 * Nothing in this file needs the display flow; it only has to be callable.
 */
jest.mock('../../../src/handlers/command.handler', () => ({
  advanceDisplayFlow: jest.fn(async () => {}),
  processCommand: jest.fn(async () => true),
}));

/** The conference the fixture board carries. */
const CONF = 1;
const MSG_BASE = 1;

/** Its real contents: eighteen messages, numbered 1..18 - conference 3's shape. */
const HIGHEST = 18;
const EVERY_MESSAGE = Array.from({ length: HIGHEST }, (_, i) => i + 1);

/** What its MailStats claimed instead. Conference 3 said exactly this. */
const STALE_HIGH = 1;

/**
 * The lowest message a scan can ever offer is `lowestNotDel + 1`, not 1:
 * express.e:5038 (`IF lastNewReadConf<mailStat.lowestNotDel THEN
 * lastNewReadConf:=mailStat.lowestNotDel`) pulls a fresh caller's pointer up
 * to the lowest undeleted message before the scan starts. So the window this
 * board can re-offer is 2..18, and that is what "everything" means below.
 */
const LOWEST_NOT_DEL = 1;
const SCAN_WINDOW = EVERY_MESSAGE.filter(n => n > LOWEST_NOT_DEL);

describe('a conference stops re-offering everything after its stats are rebuilt', () => {
  let db: any;
  let caller: any;
  let originalBbsRoot: string | undefined;
  let originalBbsDataDir: string | undefined;
  let tmpRoot = '';

  beforeAll(async () => {
    db = (global as any).testDb;
    if (!db) throw new Error('Test database not initialized');
    caller = await db.getUserByUsername('sysop');
    if (!caller) throw new Error('sysop user missing');
    originalBbsRoot = process.env.BBS_ROOT;
    originalBbsDataDir = process.env.BBS_DATA_DIR;
  });

  afterEach(() => {
    jest.resetModules();
    process.env.BBS_ROOT = originalBbsRoot;
    process.env.BBS_DATA_DIR = originalBbsDataDir;
    jest.restoreAllMocks();
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = '';
  });

  /**
   * One conference, eighteen readable messages, and MailStats that stopped
   * counting after the first one.
   */
  async function setUpBoard() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-stale-stats-'));
    process.env.BBS_ROOT = tmpRoot;
    process.env.BBS_DATA_DIR = tmpRoot;
    jest.resetModules();

    const tooltypes = require('../../../src/utils/conference-tooltypes.util');
    (tooltypes.getConferenceToolFlags as jest.Mock).mockImplementation(() => ({
      forceNewscan: false, noNewscan: false, showNewFiles: false,
      noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
    }));

    const { messageIndexManager, MsgStatus } = require('../../../src/services/MessageIndexManager');
    const scanHandler = require('../../../src/handlers/message/message-scan.handler');

    scanHandler.setMessageScanDependencies(
      db, jest.fn(), jest.fn(), jest.fn(), jest.fn(),
      [{ id: CONF, name: 'Conf1' }],
      [{ id: MSG_BASE, conferenceId: CONF, name: 'General' }],
    );

    messageIndexManager.initializeMessageIndex(CONF);

    // Addressed to EALL so the scan offers them without any per-conference
    // mail-name plumbing (message-scan.handler.ts:288, express.e:11706).
    for (const n of EVERY_MESSAGE) {
      messageIndexManager.appendMessageHeader(CONF, {
        status: MsgStatus.NORMAL, msgNumb: n,
        toName: 'EALL', fromName: 'SysOp', subject: '',
        msgDate: 0, recv: 0, extMsgNum: 0,
      });
    }

    // A header with no body is skipped (message-scan.handler.ts:278), so the
    // fixture has to write the bodies the appends did not.
    const msgBase = path.join(tmpRoot, `Conf${CONF}`, 'MsgBase');
    fs.mkdirSync(msgBase, { recursive: true });
    for (const n of EVERY_MESSAGE) {
      fs.writeFileSync(path.join(msgBase, String(n)), 'body\r\n', 'latin1');
    }

    // The defect, written in: the appends left highMsgNum at 19 and this puts
    // it back to what conference 3 actually held. lowestKey and lowestNotDel
    // are the values a rebuild would derive, so highMsgNum is the only thing
    // that changes when the repair runs.
    messageIndexManager.writeMailStats(CONF, {
      lowestKey: 1, highMsgNum: STALE_HIGH, lowestNotDel: LOWEST_NOT_DEL, pad: Buffer.alloc(6),
    });

    // The caller has read nothing yet.
    const sqlite = (db as any).db;
    sqlite.prepare(
      `INSERT INTO conf_base (user_id, conference_id, message_base_id,
                              last_new_read_conf, last_msg_read_conf, scan_flags)
       VALUES (?, ?, ?, 0, 0, ?)
       ON CONFLICT(user_id, conference_id, message_base_id)
       DO UPDATE SET last_new_read_conf = 0, last_msg_read_conf = 0, scan_flags = excluded.scan_flags`
    ).run(caller.id, CONF, MSG_BASE, ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN);

    return { messageIndexManager, scanHandler };
  }

  /**
   * One login's mail scan, through the real entry point. The pointer is NOT
   * reset between calls - whether it survives is the whole question.
   */
  async function login(scanHandler: any): Promise<number[]> {
    const socket = { emit: jest.fn() };
    const session: any = {
      user: { ...caller, confAccess: 'X' }, currentConf: CONF,
      lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0, tempData: {},
    };
    await scanHandler.performConferenceScan(socket, session);
    return (session.tempData?.confScanState?.pendingMessages ?? []).map((m: any) => m.msgNum);
  }

  function storedPointer(): number {
    const sqlite = (db as any).db;
    const row = sqlite.prepare(
      `SELECT last_new_read_conf FROM conf_base
       WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`
    ).get(caller.id, CONF, MSG_BASE);
    return row?.last_new_read_conf ?? -1;
  }

  test('the stale stats rewind the caller and the conference comes back at the next login', async () => {
    const { scanHandler } = await setUpBoard();

    expect(await login(scanHandler)).toEqual(SCAN_WINDOW);
    expect(storedPointer()).toBe(HIGHEST);

    // The pointer is still 18 in the database. validatePointers sees
    // 18 > highMsgNum 1 and rewinds it to lowestKey 1, so the whole window is
    // offered all over again - and again at the login after that.
    expect(await login(scanHandler)).toEqual(SCAN_WINDOW);
    expect(await login(scanHandler)).toEqual(SCAN_WINDOW);
  });

  test('a conference stops re-offering everything after its stats are rebuilt', async () => {
    const { messageIndexManager, scanHandler } = await setUpBoard();

    expect(await login(scanHandler)).toEqual(SCAN_WINDOW);
    expect(storedPointer()).toBe(HIGHEST);

    // The repair, exactly as it was run on conferences 1 and 3: the stats are
    // re-derived from the headers already on disk.
    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(HIGHEST);

    // Log in again. The pointer survives the clamp, so there is nothing new.
    expect(await login(scanHandler)).toEqual([]);
    expect(storedPointer()).toBe(HIGHEST);

    // And it keeps holding - the symptom was that it came back EVERY login.
    expect(await login(scanHandler)).toEqual([]);
    expect(storedPointer()).toBe(HIGHEST);
  });

  test('the rebuild rewrites the stats without touching a byte of the HeaderFile', async () => {
    const { messageIndexManager } = await setUpBoard();
    const headerPath = path.join(tmpRoot, `Conf${CONF}`, 'MsgBase', 'HeaderFile');

    const before = fs.readFileSync(headerPath);
    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));
    const after = fs.readFileSync(headerPath);

    expect(after.equals(before)).toBe(true);
    expect(after.length).toBe(HIGHEST * 110);
  });
});
