import fs from 'fs';
import os from 'os';
import path from 'path';

import { ScanFlags } from '../src/types/message-pointers';

describe('message scan mail parity', () => {
  let db: any;
  let originalBbsRoot: string | undefined;
  let sysop: any;

  beforeAll(async () => {
    db = (global as any).testDb;
    if (!db) {
      throw new Error('Test database not initialized');
    }
    sysop = await db.getUserByUsername('sysop');
    if (!sysop) {
      throw new Error('sysop user missing');
    }
    originalBbsRoot = process.env.BBS_ROOT;
  });

  afterEach(() => {
    jest.resetModules();
    process.env.BBS_ROOT = originalBbsRoot;
    jest.restoreAllMocks();
  });

  function setupMailScan(flagsOverride: Record<string, boolean> = {}) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-mail-'));
    process.env.BBS_ROOT = tmpRoot;
    jest.resetModules();

    const tooltypes = require('../src/utils/conference-tooltypes.util');
    jest.spyOn(tooltypes, 'getConferenceToolFlags').mockImplementation(() => ({
      forceNewscan: false,
      noNewscan: false,
      showNewFiles: false,
      noNewFiles: false,
      forceMenus: false,
      noBulls: false,
      noConfBulls: false,
      ...flagsOverride
    }));

    const { messageIndexManager, MsgStatus } = require('../src/services/MessageIndexManager');
    const { performConferenceScan, setMessageScanDependencies } = require('../src/handlers/message-scan.handler');
    const pointers = require('../src/utils/message-pointers.util');

    setMessageScanDependencies(
      db,
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn(),
      [{ id: 1, name: 'Conf1' }],
      [{ id: 1, conferenceId: 1, name: 'General' }]
    );

    return { tmpRoot, messageIndexManager, MsgStatus, performConferenceScan, pointers };
  }

  async function resetPointers(scanFlags = ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN) {
    await db.run(
      `INSERT OR IGNORE INTO conf_base (user_id, conference_id, message_base_id, scan_flags)
       VALUES (?, 1, 1, ?)`,
      [sysop.id, scanFlags]
    );
    await db.run(
      `UPDATE conf_base
         SET last_new_read_conf = 0,
             last_msg_read_conf = 0,
             scan_flags = ?
       WHERE user_id = ? AND conference_id = 1 AND message_base_id = 1`,
      [scanFlags, sysop.id]
    );
  }

  test('scans new public and private mail and advances pointer to mailStat high', async () => {
    const { tmpRoot, messageIndexManager, MsgStatus, performConferenceScan, pointers } = setupMailScan();
    await resetPointers();

    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE,
      msgNumb: 1,
      toName: 'SYSOP',
      fromName: 'ALICE',
      subject: 'Baseline',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 2,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Public',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.DELETED | MsgStatus.PRIVATE,
      msgNumb: 3,
      toName: 'SYSOP',
      fromName: 'ALICE',
      subject: 'Deleted',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE,
      msgNumb: 4,
      toName: 'SYSOP',
      fromName: 'ALICE',
      subject: 'Private',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };

    await performConferenceScan(socket, session);

    const after = await pointers.loadMsgPointers(sysop.id, 1, 1);
    expect(after.lastNewReadConf).toBe(4);
    expect(session.lastScanNewPublic).toBe(1);
    expect(session.lastScanNewPrivate).toBe(1);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('skips mail scan when NO_NEWSCAN tooltype is set', async () => {
    const { tmpRoot, messageIndexManager, MsgStatus, performConferenceScan, pointers } = setupMailScan({
      noNewscan: true
    });
    await resetPointers();

    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 1,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Public',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };
    const before = await pointers.loadMsgPointers(sysop.id, 1, 1);

    await performConferenceScan(socket, session);
    const after = await pointers.loadMsgPointers(sysop.id, 1, 1);

    expect(after.lastNewReadConf).toBe(before.lastNewReadConf);
    expect(session.lastScanTotal).toBe(0);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('force newscan overrides disabled scan flags', async () => {
    const { tmpRoot, messageIndexManager, MsgStatus, performConferenceScan, pointers } = setupMailScan({
      forceNewscan: true
    });
    await resetPointers(0);

    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 1,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Baseline',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE,
      msgNumb: 2,
      toName: 'SYSOP',
      fromName: 'ALICE',
      subject: 'Forced',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };
    const before = await pointers.loadMsgPointers(sysop.id, 1, 1);

    await performConferenceScan(socket, session);
    const after = await pointers.loadMsgPointers(sysop.id, 1, 1);

    expect(before.lastNewReadConf).toBe(0);
    expect(after.lastNewReadConf).toBe(2);
    expect(session.lastScanNewPrivate).toBe(1);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});
