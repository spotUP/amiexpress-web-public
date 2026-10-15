/**
 * The paging wait ALWAYS ends, and the tick that runs it is quiet and tidy.
 *
 * F8: `activateGrumpyBot` is try/FINALLY, not try/catch, and it writes to the
 * database (acceptPage). The end-of-wait handler was a floating
 * `void (async () => ...)()` with no `.catch`, and the per-second checker
 * discarded its promise. A throw out of either one skipped express.e's "You
 * may continue using the system" line and left the caller sitting in
 * OPERATOR_CHAT_WAITING with no bot and no sysop - and, on Node 15+, an
 * unhandled rejection ends the process and every other caller with it.
 *
 * F9: the checker printed one line per pending page EVERY SECOND on the live
 * board - 86,400 identical lines a day for one unanswered page.
 *
 * F16: `deferredTakeovers` was only ever deleted on a SUCCESSFUL takeover, so
 * a page abandoned while the caller was still inside a door leaked its id for
 * the life of the process.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(30000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { PageStatus } from '../../src/types/operator-chat.types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plain = (chunks: string[]) =>
  chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[78]/g, '').replace(/\x1b%G/g, '');

// One module instance for the whole file, like the takeover suite: the
// handler's `userSessions` must be THIS file's `userSessions`.
const H = require('../../src/handlers/operator-chat.handler');

interface World {
  repo: any;
  io: any;
  session: any;
  socket: any;
  seen: string[];
}

function makeWorld(opts: { pageTimeout: number; userId?: string }): World {
  const db = new Database(':memory:');
  const repo: any = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: opts.pageTimeout, aiEnabled: false, aiProvider: 'rule-based',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, allowedSecLevels: [], pageCooldown: 0, botTypoProbability: 0,
  } as any);
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, any>();
  const io: any = {
    fetchSockets: async () => [],
    on() {},
    emit() {},
    to: () => ({ emit() {} }), in: () => ({ emit() {} }),
    sockets: { adapter: { rooms }, sockets },
  };
  io.of = () => io;
  const seen: string[] = [];
  const userId = opts.userId ?? `u-${Math.random().toString(36).slice(2)}`;
  const session: any = {
    user: { id: userId, username: 'Caller', secLevel: 50 }, nodeId: 1,
    connectionType: 'telnet', currentConf: 1, currentConfName: 'General',
    tempData: {}, subState: 'LOGGED_ON',
  };
  const collect = (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); };
  registerConnectionEmitter(session, { emit: collect } as any);
  userSessions.set(userId, session);
  const socket: any = { id: `s-${userId}`, emit: collect, on() {}, join() {}, rooms: new Set(), session };
  const w = { repo, io, session, socket, seen };
  started.push(w);
  return w;
}

const started: any[] = [];
afterEach(() => {
  H.stopOperatorChatHandler();
  // A page nobody accepted leaves its own paging-dot interval ticking.
  for (const w of started.splice(0)) {
    if (w.session.tempData?.dotIntervalId) clearInterval(w.session.tempData.dotIntervalId);
  }
  userSessions.clear();
  jest.restoreAllMocks();
});

describe('the paging wait always ends', () => {
  it('frees the caller when the bot takeover throws, instead of leaving them waiting for nobody', async () => {
    const w = makeWorld({ pageTimeout: 2 });
    // acceptPage's database write fails - the exact throw activateGrumpyBot's
    // try/FINALLY lets straight through to its caller.
    const realUpdate = w.repo.updatePageStatus.bind(w.repo);
    w.repo.updatePageStatus = (id: string, status: string, ...rest: unknown[]) => {
      if (status === PageStatus.ACCEPTED) throw new Error('database is locked');
      return realUpdate(id, status, ...rest);
    };
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_WAITING);

    await wait(3500);

    expect(plain(w.seen)).toContain('You may continue using the system');
    expect(w.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    // The page was never accepted, so it is still there for a sysop.
    expect(w.repo.getPageRequest(w.session.tempData.pageId).status).toBe(PageStatus.PENDING);
  });

  it('does not turn a failed timeout tick into an unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => { rejections.push(reason); };
    process.on('unhandledRejection', onRejection);
    try {
      const w = makeWorld({ pageTimeout: 2 });
      let calls = 0;
      const realPending = w.repo.getPendingPages.bind(w.repo);
      w.repo.getPendingPages = () => {
        calls++;
        if (calls <= 2) throw new Error('database is locked');
        return realPending();
      };
      H.initOperatorChatHandler(w.io, w.repo);

      await wait(3500);

      expect(calls).toBeGreaterThanOrEqual(3); // the checker survived the throw
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('does not repeat the same pending-page line on every one-second tick', async () => {
    const logged: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(' '));
    });
    const w = makeWorld({ pageTimeout: 120 });
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);

    const before = logged.length;
    await wait(4200);
    const ticks = logged.slice(before);

    const checking = ticks.filter((l) => /Checking \d+ pending pages/.test(l));
    const elapsedLines = ticks.filter((l) => /elapsed=\d+s, timeout=/.test(l));
    // Four ticks went by and nothing about the page changed.
    expect(checking.length).toBeLessThanOrEqual(1);
    expect(elapsedLines.length).toBeLessThanOrEqual(1);
  });

  it('forgets a page abandoned while the caller was still inside a door', async () => {
    const w = makeWorld({ pageTimeout: 1 });
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;

    // The caller walks into a door: the bot defers, and says so once.
    w.session.subState = LoggedOnSubState.DOOR_RUNNING;
    w.session.doorInputHandler = () => {};
    await wait(2600);
    expect(H.operatorChatPageTickStateForTest().deferredTakeovers).toContain(pageId);

    // The page is abandoned - CTRL-C at the prompt, or a chat that ended -
    // while the caller is still in the door, so no takeover ever succeeds.
    w.repo.updatePageStatus(pageId, PageStatus.TIMEOUT);
    await wait(2200);

    expect(H.operatorChatPageTickStateForTest().deferredTakeovers).not.toContain(pageId);
    expect(H.operatorChatPageTickStateForTest().pageTickLogged).not.toContain(pageId);
  });
});
