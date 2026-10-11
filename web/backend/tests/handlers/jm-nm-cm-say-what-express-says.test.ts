/**
 * JM, NM and CM print what express.e prints - tier-5 invented-text audit,
 * message-commands.handler.ts (thoughts/spot/notes/2026-10-12_tier5-message-commands.md).
 *
 *   JM   internalCommandJM  express.e:25185-25238
 *   NM   internalCommandNM  express.e:25281-25370, who(0) 24204-24384
 *   CM   conferenceMaintenance express.e:22686-22939, dumpUserStats 22521-22585
 *
 * Each `it` is named after what the sysop saw before the fix.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockRun = jest.fn(async () => undefined);
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDatabase: () => ({ run: mockRun, query: jest.fn() }),
}));

const mockAccounts = new Map<number, unknown>();
jest.mock('../../src/handlers/message/msg-names', () => ({
  loadAccount: (slot: number) => mockAccounts.get(slot) ?? null,
}));

import {
  handleJMInput,
  handleNodeManagementCommand,
  handleNMInput,
  handleNMConfirm,
  handleCMInput,
  handleCMNumericInput,
  setMessageCommandsDependencies,
} from '../../src/handlers/message/message-commands.handler';
import {
  messagePointerFileManager,
  deserializeConfBase,
  serializeConfBase,
  CONFBASE_RECORD_SIZE,
} from '../../src/services/MessagePointerFileManager';
import { writePackedBCD } from '../../src/utils/bcd-math.util';
import { WHO_TABLE_TOP, WHO_TABLE_BOTTOM } from '../../src/utils/who-table.util';
import { YES_NO_PROMPT } from '../../src/utils/await-input';
import { flushOutput } from '../../src/utils/output.util';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';

const SYSOP = { id: 'u1', username: 'SPOT', secLevel: 255, securityFlags: 'T'.repeat(64) };

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    id: `t5-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  return {
    socket,
    /** Everything written since the last call. */
    raw: () => { flushOutput(socket); return out.splice(0).join(''); },
  };
}

function deps(sessions: Map<string, any> = new Map(), extra: Record<string, unknown> = {}) {
  setMessageCommandsDependencies({
    messageBases: [
      { id: 1, conferenceId: 1, name: 'General' },
      { id: 2, conferenceId: 1, name: 'Elite' },
    ] as never,
    conferences: [{ id: 1, name: 'Uptown' }] as never,
    sessions,
    joinConference: jest.fn(async () => true),
    displayScreen: jest.fn(() => true),
    resetNewMailScanPointers: jest.fn(async () => 0),
    resetLastMessageReadPointers: jest.fn(async () => 0),
    getConferenceStats: jest.fn(async () => ({ userCount: 12, capacity: 200 })),
    updateMessageNumberRange: jest.fn(async () => true),
    getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 99 })),
    ...extra,
  } as never);
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockRun.mockClear();
  mockAccounts.clear();
});

describe('JM', () => {
  it('joining a message base by number leaves no "press any key" behind (express.e:25232-25233)', () => {
    const join = jest.fn(async () => true);
    deps(new Map(), { joinConference: join });
    const { socket, raw } = socketSpy();
    const session: any = {
      currentConf: 1,
      tempData: { currentConfBases: [{ id: 1 }, { id: 2 }] },
    };

    handleJMInput(socket, session, '2');

    expect(join).toHaveBeenCalledWith(socket, session, 1, 2);
    expect(raw()).toBe('\r\n');
  });

  it('a number past the last base joins the last base instead of doing nothing (express.e:25229-25230)', () => {
    const join = jest.fn(async () => true);
    deps(new Map(), { joinConference: join });
    const { socket } = socketSpy();
    const session: any = { currentConf: 1, tempData: { currentConfBases: [{ id: 1 }, { id: 2 }] } };

    handleJMInput(socket, session, '9');

    expect(join).toHaveBeenCalledWith(socket, session, 1, 2);
  });
});

describe('NM', () => {
  function nodes() {
    return new Map<string, any>([
      ['1', { nodeId: 1, user: SYSOP, state: BBSState.LOGGEDON, currentStat: EnvStat.SYSOP }],
      ['2', { nodeId: 2, user: { username: 'ZAPHOD', location: 'Betelgeuse' }, state: BBSState.LOGGEDON, currentStat: EnvStat.IDLE }],
    ]);
  }

  it('the node list is who(0)\'s table, the one WHO prints, and an empty one has no "No active nodes" line', () => {
    deps(new Map());
    const { socket, raw } = socketSpy();
    const session: any = { nodeId: 1, user: SYSOP };

    handleNodeManagementCommand(socket, session);

    expect(raw()).toBe(
      WHO_TABLE_TOP.join('') + WHO_TABLE_BOTTOM.join('') + '\r\nWhich to change <Q>=QUIT ? ',
    );
  });

  it('a node nobody holds says nothing - no "Node N is not active" (express.e:25312-25321)', () => {
    deps(nodes());
    const { socket, raw } = socketSpy();
    const session: any = { nodeId: 1, user: SYSOP };

    handleNMInput(socket, session, '7');

    const out = raw();
    expect(out).not.toContain('not active');
    expect(out.startsWith('\r\n\r\n' + WHO_TABLE_TOP.join(''))).toBe(true);
  });

  it('the disconnect question names no user and asks yesNo(2) in its colours (express.e:25349-25351)', () => {
    deps(nodes());
    const { socket, raw } = socketSpy();
    const session: any = { nodeId: 1, user: SYSOP };

    handleNMInput(socket, session, '2');

    expect(raw()).toBe('\r\n\r\nDo you wish to disconnect the current user from node 2 ' + YES_NO_PROMPT[2]);
    expect(session.subState).toBe(LoggedOnSubState.NM_CONFIRM);
  });

  it('answering the question echoes Yes or No and nothing else - no "taken offline" / "will accept connections"', () => {
    const sessions = nodes();
    deps(sessions);
    jest.useFakeTimers();
    const { socket, raw } = socketSpy();
    const session: any = { nodeId: 1, user: SYSOP, tempData: { nmNode: 2, nmOp: 'offline' } };

    handleNMConfirm(socket, session, 'x'); // not y, n or Return: still waiting
    expect(raw()).toBe('');
    expect(session.tempData).toEqual({ nmNode: 2, nmOp: 'offline' });

    handleNMConfirm(socket, session, 'Y');
    expect(raw()).toBe('Yes\r\n');
    expect(sessions.get('2').currentStat).toBe(EnvStat.SHUTDOWN);

    const other: any = { nodeId: 1, user: SYSOP, tempData: { nmNode: 5, nmOp: 'online' } };
    const spy = socketSpy();
    handleNMConfirm(spy.socket, other, ''); // Return means no
    expect(spy.raw()).toBe('No\r\n');
  });

  it('Q returns to the menu through the pause, as every command does (express.e:28647)', () => {
    deps(nodes());
    const { socket } = socketSpy();
    const session: any = { nodeId: 1, user: SYSOP, menuPause: false };

    handleNMInput(socket, session, 'Q');

    expect(session.menuPause).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe('CM', () => {
  function cmSession(): any {
    return { user: SYSOP, currentConf: 1, tempData: { cmConf: 1, cmMsgBase: 1 } };
  }

  it('the menu draws express.e\'s bytes - zero-filled message numbers, no line breaks of its own', async () => {
    deps();
    const { socket, raw } = socketSpy();

    await handleCMInput(socket, cmSession(), 'x');

    const out = raw();
    expect(out).toContain('\x1b[2;1H                      \x1b[33mCONFERENCE MAINTENANCE\x1b[0m\x1b[4;1H');
    expect(out).toContain('\x1b[10;40H\x1b[33mB.>\x1b[32m Next   Msg # \x1b[0m00000099\x1b[11;40H');
    expect(out).toContain('\x1b[11;40H\x1b[33mC.>\x1b[32m Lowest Msg # \x1b[0m00000001\x1b[12;40H');
  });

  it('resetting pointers says Working.... - no "[OK] ... reset for all users"', async () => {
    deps();
    const { socket, raw } = socketSpy();

    await handleCMInput(socket, cmSession(), '3');

    const out = raw();
    expect(out).toContain('\x1b[18;2H \x1b[0mWorking....');
    expect(out).not.toContain('[OK]');
    expect(out).not.toContain('Resetting');
  });

  it('a ratio says Working.... and no "Ratio updated to"', async () => {
    deps();
    jest.spyOn(messagePointerFileManager, 'updateAllUsers').mockReturnValue(0);
    const { socket, raw } = socketSpy();

    await handleCMNumericInput(socket, cmSession(), '3', 'RATIO');

    const out = raw();
    expect(out).toContain('\x1b[18;2H \x1b[0mWorking....');
    expect(out).not.toContain('Ratio updated');
  });

  it('a capacity says "Resizing, Please Standby", and 0 resizes nothing and says nothing (express.e:22845-22853)', async () => {
    deps();
    const a = socketSpy();
    await handleCMNumericInput(a.socket, cmSession(), '300', 'CAPACITY');
    expect(a.raw()).toContain('\x1b[18;2H\x1b[0mResizing, Please Standby');
    expect(mockRun).toHaveBeenCalledTimes(1);

    const b = socketSpy();
    await handleCMNumericInput(b.socket, cmSession(), '', 'CAPACITY');
    const out = b.raw();
    expect(out).not.toContain('Resizing');
    expect(out).not.toContain('Invalid value');
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('"Default ON" asks yesNo(1), Return means yes, and the answer is Working.... - no "Setting ... to OFF"', async () => {
    deps();
    const change = jest.spyOn(messagePointerFileManager, 'updateAllUsers').mockReturnValue(0);
    const { socket, raw } = socketSpy();
    const session = cmSession();

    await handleCMInput(socket, session, '6');
    expect(raw()).toBe(`\x1b[18;2H \x1b[0mDefault ON ${YES_NO_PROMPT[1]}`);

    await handleCMInput(socket, session, ''); // Return
    const out = raw();
    expect(out.startsWith('Yes\r\n\x1b[18;2H \x1b[0mWorking....')).toBe(true);
    expect(out).not.toContain('Setting');
    expect(out).not.toContain('for all users');

    const rec = deserializeConfBase(Buffer.alloc(CONFBASE_RECORD_SIZE));
    change.mock.calls[0]![1](rec);
    expect(rec.handle[0]! & 4).toBe(4);
  });

  it('TAB leaves the screen standing with the prompt row blanked, and the menu pauses first', async () => {
    deps();
    const { socket, raw } = socketSpy();
    const session = cmSession();

    await handleCMInput(socket, session, '');

    expect(raw()).toBe('\x1b[18;2H                                     ');
    expect(session.menuPause).toBe(true);
  });

  it('the stats dump writes express.e\'s Conf.Stats - no "[OK] Stats dumped" on screen', async () => {
    deps();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-stats-'));
    const prev = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = dir;
    try {
      const dbFile = path.join(dir, 'Conf.DB');
      const rec = deserializeConfBase(Buffer.alloc(CONFBASE_RECORD_SIZE));
      Object.assign(rec, { ratio: 3, ratioType: 1, upload: 4, downloads: 5, messagesPosted: 6 });
      rec.uploadBytesBCD = writePackedBCD(1234n);
      rec.downloadBytesBCD = writePackedBCD(0n);
      fs.writeFileSync(dbFile, Buffer.concat([serializeConfBase(rec), serializeConfBase(rec)]));
      jest.spyOn(messagePointerFileManager, 'getConfDbPath').mockReturnValue(dbFile);
      // Slot 2 does not load, so it is skipped (express.e:22546).
      mockAccounts.set(1, {
        slot: 1,
        user: { name: 'ZAPHOD', location: 'Betelgeuse', conferenceAccess: Buffer.from('XX\0junk', 'latin1') },
      });
      const { socket, raw } = socketSpy();

      await handleCMInput(socket, cmSession(), '5');

      const out = raw();
      expect(out).toContain('\x1b[18;2H \x1b[0mWorking....');
      expect(out).not.toContain('Stats dumped');
      expect(fs.readFileSync(path.join(dir, 'Conf1.Stats'), 'latin1')).toBe([
        'Conference Name: Uptown',
        '='.repeat(42),
        'Name            : ZAPHOD',
        'Location        : Betelgeuse',
        'Area Access     : XX',
        'Ratio           : 3',
        'RatioType       : 1',
        'Files Uploaded  : 4',
        'Files Downloaded: 5',
        'Bytes Uploaded  : 1234',
        'Bytes Downloaded: 0',
        'Messages Posted : 6',
        '-'.repeat(42),
        '',
      ].join('\n'));
    } finally {
      if (prev === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
