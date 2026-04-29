// The chain `message-scan.handler` -> `command.handler` -> `index.ts` boots
// the real telnet/SSH/HTTP servers. With jest.resetModules() we re-require
// that chain per test, so each test would try to bind the same fixed ports.
// Override before any require to make every binding land on an ephemeral
// port (or a clearly unused range) so successive resetModules() never collide.
process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ScanFlags } from '../src/types/message-pointers';

// jest.spyOn cannot redefine swc-emitted exports (they're declared
// non-configurable). Hoist jest.mock so each export exists as a jest.fn()
// that tests can re-implement via mockImplementation / mockResolvedValue.
jest.mock('../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(),
}));
jest.mock('../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn(),
  runSystemCommand: jest.fn(),
}));

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
    (tooltypes.getConferenceToolFlags as jest.Mock).mockImplementation(() => ({
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
    const { performConferenceScan, setMessageScanDependencies } = require('../src/handlers/message/message-scan.handler');
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

  async function setScanFlags(scanFlags: number) {
    await resetPointers(scanFlags);
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
      // express.e mailHeader.status is a single ASCII char ('P', 'p', 'R', 'D')
      // — the old `DELETED | PRIVATE` bit-OR collapsed to `'V'` (0x56), which
      // matched neither status. DELETED alone is what express.e uses for a
      // killed private message anyway (no compound state).
      status: MsgStatus.DELETED,
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

describe('file scan gating parity', () => {
  let db: any;
  let sysop: any;
  let originalBbsRoot: string | undefined;

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

  function setup(toolFlags: Record<string, boolean> = {}) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-file-'));
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
      ...toolFlags
    }));

    const { performConferenceScan, setMessageScanDependencies } = require('../src/handlers/message/message-scan.handler');
    setMessageScanDependencies(
      db,
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn(),
      [{ id: 1, name: 'Conf1' }],
      [{ id: 1, conferenceId: 1, name: 'General' }]
    );

    const { messageIndexManager, MsgStatus } = require('../src/services/MessageIndexManager');
    return { tmpRoot, performConferenceScan, messageIndexManager, MsgStatus };
  }

  async function setScanFlags(flags: number) {
    await db.run(
      `INSERT OR IGNORE INTO conf_base (user_id, conference_id, message_base_id, scan_flags)
       VALUES (?, 1, 1, ?)`,
      [sysop.id, flags]
    );
    await db.run(
      `UPDATE conf_base SET scan_flags = ? WHERE user_id = ? AND conference_id = 1 AND message_base_id = 1`,
      [flags, sysop.id]
    );
  }

  test('per-base FILE_SCAN_MASK alone does NOT trigger file scan (WEB_ deviation)', async () => {
    // express.e:601-607 originally enabled the new-files scan whenever the
    // user's conf_base FILE_SCAN_MASK bit was set. The WEB_ port omits that
    // DB-based path on purpose (handoff.md: "File scan at login disabled
    // (uses QuickNew instead of AquaScan); set SHOW_NEW_FILES in .info to
    // re-enable per conference"). Per-base scan_flags alone — without the
    // SHOW_NEW_FILES tooltype — must NOT call runSysCommand('N','S U').
    const { tmpRoot, performConferenceScan, messageIndexManager, MsgStatus } = setup();
    await setScanFlags(ScanFlags.FILE_SCAN | ScanFlags.MAIL_SCAN);
    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 1,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Seed',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const runSysCommand = require('../src/handlers/command-execution.handler').runSysCommand as jest.Mock;
    runSysCommand.mockReset();
    runSysCommand.mockResolvedValue(undefined);
    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };

    await performConferenceScan(socket, session);
    expect(runSysCommand).not.toHaveBeenCalled();

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('NO_NEW_FILES tooltype suppresses new files scan even when enabled per-base', async () => {
    const { tmpRoot, performConferenceScan, messageIndexManager, MsgStatus } = setup({ noNewFiles: true });
    await setScanFlags(ScanFlags.FILE_SCAN | ScanFlags.MAIL_SCAN);
    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 1,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Seed',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const runSysCommand = require('../src/handlers/command-execution.handler').runSysCommand as jest.Mock;
    runSysCommand.mockReset();
    runSysCommand.mockResolvedValue(undefined);
    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };

    await performConferenceScan(socket, session);
    expect(runSysCommand).not.toHaveBeenCalled();

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('SHOW_NEW_FILES forces new files scan even when FILE_SCAN is off', async () => {
    const { tmpRoot, performConferenceScan, messageIndexManager, MsgStatus } = setup({ showNewFiles: true });
    await setScanFlags(ScanFlags.MAIL_SCAN); // FILE_SCAN off
    messageIndexManager.initializeMessageIndex(1);
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.NORMAL,
      msgNumb: 1,
      toName: 'ALL',
      fromName: 'SYSOP',
      subject: 'Seed',
      msgDate: 0,
      recv: 0,
      extMsgNum: 0
    });

    const runSysCommand = require('../src/handlers/command-execution.handler').runSysCommand as jest.Mock;
    runSysCommand.mockReset();
    runSysCommand.mockResolvedValue(undefined);
    const socket = { emit: jest.fn() };
    const session = { user: { ...sysop, confAccess: 'X' }, currentConf: 1, lastScanNewPublic: 0, lastScanNewPrivate: 0, lastScanTotal: 0 };

    await performConferenceScan(socket, session);
    expect(runSysCommand).toHaveBeenCalledWith(socket, session, 'N', 'S U');

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});
