/**
 * The Board channel (NOTIFY door): a notification reaches the caller at the
 * command-prompt boundary and nowhere else. ONE reachability test, driven
 * through the real dispatcher tick and the real displayMainMenu (the menu
 * suite's mocks around it): an offline caller's notification lands in
 * notify_inbox and the next menu draws it; an at-the-prompt caller sees it at
 * once. Sentinel: the toast text reaches the socket and the inbox empties.
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
import { defaultNoticeDeps } from '../../src/achievements/notices';
import { deliverBoard, drainNotifyInbox } from '../../src/notify/board';
import { dispatchOnce, _resetPurgeClockForTests } from '../../src/notify/dispatcher';
import type { DispatcherDeps } from '../../src/notify/dispatcher';
import { queueNotification } from '../../src/notify/intake';
import { inboxCount, pendingCount, setPrefs } from '../../src/notify/repository';
import { registerConnectionEmitter, unregisterConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';

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
const NOW_MS = 1_800_000_000_000;
const item: NotifyItem = { event: 'msg.reply', title: 'Reply from bob', body: 'Re: the zebra thread', at: NOW_MS / 1000, objectId: 'm42' };

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
  socket.emit.mock.calls.filter((c) => c[0] === 'ansi-output' && String(c[1]).includes('zebra')).map((c) => String(c[1]));

const depsFor = (): DispatcherDeps => ({
  rawDb: () => db,
  now: () => NOW_MS,
  log: () => undefined,
  boardZone: () => 'UTC',
  senders: {},
  showBoard: (userId, it) => deliverBoard(null, userId, it, { rawDb: () => db, now: () => NOW_MS }),
});

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultNoticeDeps.rawDb = () => db;
}, 30000);

beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_outbox', 'notify_inbox']) db.exec(`DELETE FROM ${t}`);
  userSessions.clear();
  _resetPurgeClockForTests();
  jest.clearAllMocks();
});

describe('Board channel', () => {
  it('an offline caller gets the notification in the inbox and the next menu draws it once, before the prompt', async () => {
    setPrefs(db, 'u-caller', { 'msg.reply': { board: 'instant' } });
    expect(queueNotification(db, 'u-caller', item, NOW_MS / 1000, 'UTC')).toBe(1);

    // No live session registered: the dispatcher tick cannot draw it.
    const outcome = await dispatchOnce(depsFor());
    expect(outcome.sent).toBe(1);
    expect(pendingCount(db)).toBe(0);
    expect(inboxCount(db, 'u-caller')).toBe(1);

    const session = makeSession();
    const socket = socketOf();
    await displayMainMenu(socket as any, session);
    const shown = toasts(socket);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('REPLY FROM BOB');
    expect(inboxCount(db, 'u-caller')).toBe(0);

    const again = socketOf();
    await displayMainMenu(again as any, session);
    expect(toasts(again)).toHaveLength(0);
  });

  it('a caller at the prompt sees it at once, on a line of its own, and the inbox stays empty', async () => {
    const session = makeSession({ subState: LoggedOnSubState.READ_COMMAND });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverBoard(null, 'u-caller', item, { rawDb: () => db, now: () => NOW_MS })).toBe('shown');
      const written = emitter.emit.mock.calls.map((c: unknown[]) => String(c[1])).join('');
      expect(written.startsWith('\r\n')).toBe(true);
      expect(written).toContain('zebra');
      expect(inboxCount(db, 'u-caller')).toBe(0);
    } finally {
      unregisterConnectionEmitter(session);
    }
  });

  it('a parked caller is away: the notice is kept and the inbox is not drained until he resumes', () => {
    const session = makeSession({ subState: LoggedOnSubState.READ_COMMAND, detachedAt: NOW_MS });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverBoard(null, 'u-caller', item, { rawDb: () => db, now: () => NOW_MS })).toBe('kept');
      expect(emitter.emit).not.toHaveBeenCalled();
      expect(drainNotifyInbox(socketOf(), session)).toBe(0);
      expect(inboxCount(db, 'u-caller')).toBe(1);

      session.detachedAt = undefined;
      const socket = socketOf();
      expect(drainNotifyInbox(socket, session)).toBeGreaterThanOrEqual(1);
      expect(toasts(socket)).toHaveLength(1);
    } finally {
      unregisterConnectionEmitter(session);
    }
  });

  it('a caller mid-read is not interrupted: it waits for the menu', () => {
    const session = makeSession({ subState: LoggedOnSubState.READ_MESSAGES });
    const emitter = { emit: jest.fn() };
    registerConnectionEmitter(session, emitter as any);
    userSessions.set('u-caller', session);
    try {
      expect(deliverBoard(null, 'u-caller', item, { rawDb: () => db, now: () => NOW_MS })).toBe('kept');
      expect(emitter.emit).not.toHaveBeenCalled();
      const socket = socketOf();
      expect(drainNotifyInbox(socket, session)).toBe(1);
    } finally {
      unregisterConnectionEmitter(session);
    }
  });
});
