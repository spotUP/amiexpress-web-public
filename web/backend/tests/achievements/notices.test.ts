/**
 * SP2-6 - where an unlock is shown: the command-prompt boundary, and
 * nowhere else. Driven through the real displayMainMenu (the menu suite's
 * mocks around it) and the real emitter registry for the live case.
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  hasKeysFile: jest.fn().mockReturnValue(false),
  hasKeysFileForResolvedPath: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({ get: jest.fn((key: string) => (key === 'bbsName' ? 'TestBBS' : null)) }),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(null),
  getScreenMenu: jest.fn().mockReturnValue('MENU'),
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn().mockReturnValue({
    forceMenus: false, noBulls: false, noConfBulls: false, forceNewscan: false, noNewscan: false, showNewFiles: false, noNewFiles: false,
  }),
}));
jest.mock('../../src/utils/time-tracking.util', () => ({
  updateTimeUsed: jest.fn(), getTimeRemainingMinutes: jest.fn().mockReturnValue(60),
}));
jest.mock('../../src/handlers/time-limit.handler', () => ({ checkTimeUsed: jest.fn().mockResolvedValue(false) }));
jest.mock('../../src/utils/output.util', () => ({ emitText: jest.fn(), emitPrompt: jest.fn() }));
jest.mock('../../src/handlers/transfer/olm.handler', () => ({ processOlmQueue: jest.fn() }), { virtual: true });

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayMainMenu } from '../../src/handlers/command-handler/menu';
import { defaultNoticeDeps, deliverNotice, drainAchievementNotices } from '../../src/achievements/notices';
import { addUnlockNotice, noticeCount } from '../../src/achievements/outbox.repository';
import { registerConnectionEmitter, unregisterConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import type { UnlockOut } from '../../src/achievements/contract';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let db: any;
const unlock: UnlockOut = { id: 'msg.post.100', name: 'Century', tier: 'silver', points: 10, hidden: false, rarityPctTenths: 81, at: '2026-09-07T10:00:00Z' };

function makeSession(overrides: Record<string, unknown> = {}): any {
  return {
    user: { id: 'u-caller', username: 'tester', email: 'caller@example.com', expert: 'N' },
    subState: LoggedOnSubState.READ_COMMAND,
    relConfNum: 1, currentConf: 1, currentConfName: 'General', currentMsgBase: 1, timeRemaining: 3600,
    cmdShortcuts: false, shortcuts: new Map(), paginatedScreen: null, lastScreenHadPause: false, doorExpertMode: false,
    screenWidth: 80, tempData: {},
    ...overrides,
  };
}
const socketOf = (): { emit: jest.Mock; connected: boolean } => ({ emit: jest.fn(), connected: true });
const toasts = (socket: { emit: jest.Mock }): string[] =>
  socket.emit.mock.calls.filter((c) => c[0] === 'ansi-output' && String(c[1]).includes('ACHIEVEMENT')).map((c) => String(c[1]));

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultNoticeDeps.rawDb = () => db;
}, 30000);

beforeEach(() => {
  db.exec('DELETE FROM achievement_pending_notices');
  userSessions.clear();
  jest.clearAllMocks();
});

describe('unlock notices', () => {
  it('an unlock earned while the caller reads a message is shown at the next menu, not mid-read', async () => {
    const session = makeSession({ subState: LoggedOnSubState.READ_MESSAGES });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('kept');
      expect(emitter.emit).not.toHaveBeenCalled();
      expect(noticeCount(db, 'u-caller')).toBe(1);

      const socket = socketOf();
      await displayMainMenu(socket as any, session);
      const shown = toasts(socket);
      expect(shown).toHaveLength(1);
      expect(shown[0]).toContain('Century');
      expect(shown[0]).toContain('SILVER, 10 pts');
      // Drawn before the prompt was armed, and not again.
      expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
      expect(noticeCount(db, 'u-caller')).toBe(0);
    } finally {
      unregisterConnectionEmitter(session);
    }
  });

  it('an unlock earned AT the prompt starts on a line of its own', async () => {
    // The caller is sitting at "Menu (56 mins. left): " - a prompt ends
    // mid-line with no newline after it. Written straight out, the toast's
    // top edge began inside the prompt text and the box came out broken
    // (screenshot from the board, 2026-09-08).
    const session = makeSession({ subState: LoggedOnSubState.READ_COMMAND });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('shown');

      const written = emitter.emit.mock.calls
        .filter((c: unknown[]) => c[0] === 'ansi-output')
        .map((c: unknown[]) => String(c[1]))
        .join('');

      // Whatever else it draws, it must break the line before drawing it.
      expect(written.startsWith('\r\n')).toBe(true);
      expect(written).toContain('Century');
    } finally {
      unregisterConnectionEmitter(session);
    }
  });

  it('an unlock earned at the prompt is shown at once and not again at the next menu', async () => {
    const session = makeSession({ subState: LoggedOnSubState.READ_COMMAND });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('shown');
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(String(emitter.emit.mock.calls[0][1])).toContain('Century');
      expect(noticeCount(db, 'u-caller')).toBe(0);
      const socket = socketOf();
      await displayMainMenu(socket as any, session);
      expect(toasts(socket)).toEqual([]);
      // In a door, the prompt state means nothing: kept.
      session.inDoorManager = true;
      expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('kept');
    } finally {
      unregisterConnectionEmitter(session);
    }
  });

  it("a caller who is not online sees the notice at the next login's menu, sized for their terminal", async () => {
    expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('kept');
    addUnlockNotice(db, 'u-caller', { ...unlock, name: 'Second' }, 1);
    const socket = socketOf();
    const c64 = makeSession({ screenWidth: 40, petsciiMode: true, terminalType: 'c64' });
    await displayMainMenu(socket as any, c64);
    const shown = toasts(socket);
    expect(shown).toHaveLength(2);
    for (const t of shown) {
      expect(t).not.toContain('\x1b[');
      for (const line of t.split('\r\n')) expect(line.length).toBeLessThanOrEqual(40);
    }
    expect(shown.map((t) => (t.includes('Century') ? 'Century' : 'Second'))).toEqual(['Century', 'Second']);
  });

  /**
   * A PETSCII session can still be carrying the width the BROWSER reported
   * before the caller answered the graphics prompt: index.ts sets
   * petsciiMode and then refuses to write geometry for a PETSCII session, so
   * `screenWidth` may read 80 on a C64. The toast used to believe it and
   * drew an 80-column box across a 40-column screen. The mode owns the
   * width, which is what doorScreenWidth answers.
   */
  it('a C64 whose session still carries the browser 80 gets a 40-column toast anyway', async () => {
    expect(deliverNotice(null, 'u-caller', 'unlock', unlock)).toBe('kept');
    const socket = socketOf();
    const stale = makeSession({ screenWidth: 80, petsciiMode: true, terminalType: 'c64' });
    await displayMainMenu(socket as any, stale);
    const shown = toasts(socket);
    expect(shown).toHaveLength(1);
    for (const line of shown[0].split('\r\n')) expect(line.length).toBeLessThanOrEqual(40);
  });

  /**
   * ...and the wide PETSCII screen is 80, from the same authority. A name
   * that does not fit 40 columns is what tells the two widths apart: the C64
   * has to fold it, and this caller does not.
   */
  it('an 80-column PETSCII caller is given the room a C64 does not have', async () => {
    const longName = 'The Longest Achievement Name This Board Has Ever Shipped';
    const widestOf = async (session: any): Promise<number> => {
      db.exec("DELETE FROM achievement_pending_notices");
      expect(deliverNotice(null, 'u-caller', 'unlock', { ...unlock, name: longName })).toBe('kept');
      const socket = socketOf();
      await displayMainMenu(socket as any, session);
      const shown = toasts(socket);
      expect(shown).toHaveLength(1);
      expect(shown[0]).not.toContain('\x1b[');
      return Math.max(...shown[0].split('\r\n').map((l: string) => l.length));
    };

    const narrow = await widestOf(makeSession({ screenWidth: 80, petsciiMode: true, terminalType: 'c64' }));
    const wide = await widestOf(makeSession({ screenWidth: 80, petsciiMode: true, petsciiColumns: 80 }));

    expect(narrow).toBeLessThanOrEqual(40);
    expect(wide).toBeGreaterThan(40);
    expect(wide).toBeLessThanOrEqual(80);
  });

  it('a not_linked refusal shows the link explanation once, not once per event', async () => {
    expect(deliverNotice(null, 'u-caller', 'link', null)).toBe('kept');
    expect(deliverNotice(null, 'u-caller', 'link', null)).toBe('kept');
    expect(deliverNotice(null, 'u-caller', 'link', null)).toBe('kept');
    expect(noticeCount(db, 'u-caller')).toBe(1);
    const socket = socketOf();
    await displayMainMenu(socket as any, makeSession());
    const shown = toasts(socket);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('Type ACHIEVE at the prompt to link');
    // A caller without a user id gets nothing and breaks nothing.
    expect(drainAchievementNotices(socketOf(), { user: null })).toBe(0);
  });
});
