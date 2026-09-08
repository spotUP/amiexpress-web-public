/**
 * A chat begins where the caller's keyboard is - never somewhere else.
 *
 * express.e's ccom() (express.e:20351-20381) pages for a fixed run of dots and
 * then frees the caller; a chat then starts inside readChar, so it can only
 * ever begin where the board is reading the caller's keyboard. This port
 * freed the caller after 30 hard-coded dots and fired GrumpyBot as a TIMER at
 * `pageTimeout` (120 s live) - wherever the caller had got to. On 2026-09-07
 * 19:13 that was inside a 68K door: the door painted over the intro and took
 * every keystroke, the page sat "accepted by GrumpyBot" for ever, and the
 * sysop reported "neither the openrouter ai or the grumpy sysop answers".
 * Every failed page in the live DB has that shape; the one that worked is
 * the one where the caller sat still.
 *
 * Four things are pinned, each driven through the real handler:
 *   - the caller waits the configured time AT THE PROMPT and the bot arrives
 *     there, before any "you may continue" ever prints;
 *   - a caller inside a door is not interrupted, and the bot arrives the
 *     moment the door gives them back;
 *   - a sysop's accept re-links the session from the page row, so a caller
 *     whose scratch `tempData` a menu command wiped still gets their lines
 *     into the chat;
 *   - a WEB caller (reached through the io socket map by `socketId`, not a
 *     registered connection emitter) gets the same screen - the existing
 *     suite drove only the telnet emitter.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(30000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plain = (chunks: string[]) =>
  chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[78]/g, '').replace(/\x1b%G/g, '');

/** Every intro GrumpyBot can open with (grumpy-sysop-bot.handler.ts:886-). */
const INTRO = /is AFK|isn't answering|sysop is off doing|didn't answer your page/;
/** With one engine there is no tag; a reply is a reply. */
const BOT_REPLY = /\S/;

interface World {
  repo: OperatorChatRepository;
  io: any;
  session: any;
  socket: any;
  seen: string[];
  sockets: Map<string, any>;
  connectionHandler: ((socket: any) => void) | null;
}

function makeWorld(opts: { pageTimeout: number; web?: boolean; userId?: string }): World {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: opts.pageTimeout, aiEnabled: false, aiProvider: 'rule-based',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, allowedSecLevels: [], pageCooldown: 0, botTypoProbability: 0,
  } as any);
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, any>();
  const world: any = { connectionHandler: null };
  const io: any = {
    fetchSockets: async () => [],
    on(ev: string, fn: (socket: any) => void) { if (ev === 'connection') world.connectionHandler = fn; },
    emit() {},
    to: () => ({ emit() {} }), in: () => ({ emit() {} }),
    sockets: { adapter: { rooms }, sockets },
  };
  io.of = () => io;
  const seen: string[] = [];
  const userId = opts.userId ?? 'u-caller';
  const session: any = {
    user: { id: userId, username: 'Caller', secLevel: 50 }, nodeId: 1,
    connectionType: opts.web ? 'web' : 'telnet', currentConf: 1, currentConfName: 'General',
    tempData: {}, subState: 'LOGGED_ON',
  };
  const collect = (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); };
  if (opts.web) {
    // A web caller: no registered emitter; the registry finds the live
    // socket by `session.socketId` in the io namespace's map.
    session.socketId = 'ws-caller';
    sockets.set('ws-caller', { id: 'ws-caller', emit: collect, join() {}, session });
  } else {
    registerConnectionEmitter(session, { emit: collect } as any);
  }
  userSessions.set(userId, session);
  // The paging prompt itself (the timestamp, "Paging ...", the dots) is
  // written on the socket the page command arrived on; everything after the
  // accept goes through the registry. Both land in `seen`.
  const socket: any = { id: 's1', emit: collect, on() {}, join() {}, rooms: new Set(), session };
  Object.assign(world, { repo, io, session, socket, seen, sockets });
  return world as World;
}

// One module instance for the whole file: the handler's `userSessions` must be
// THIS file's `userSessions`, and the registry it resolves emitters through
// must be the one `registerConnectionEmitter` above wrote to. Each test
// starts its own timeout checker on its own repo; afterEach stops it.
const H = require('../../src/handlers/operator-chat.handler');
const fresh = (): any => H;

afterEach(() => {
  H.stopOperatorChatHandler();
});

describe('GrumpyBot arrives where the caller is', () => {
  it('keeps the caller at the paging prompt for the whole configured wait, and the bot arrives there', async () => {
    // Fake time: the old cap was 30 hard-coded dots, so the difference only
    // shows past 30 seconds - the caller was released to the menu at 30 s and
    // the bot fired at pageTimeout wherever they had gone.
    jest.useFakeTimers();
    try {
      const H = fresh();
      const w = makeWorld({ pageTimeout: 45 });
      H.initOperatorChatHandler(w.io, w.repo);

      const paged = await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
      expect(paged.success).toBe(true);
      expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_WAITING);

      await jest.advanceTimersByTimeAsync(32_000);
      // Past the old 30-dot cap: still waiting, still dotting, nobody released.
      expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_WAITING);
      expect(plain(w.seen)).not.toContain('You may continue using the system');
      expect(plain(w.seen)).not.toMatch(INTRO);
      expect(w.seen.filter((c) => c === ' .').length).toBeGreaterThanOrEqual(31);

      await jest.advanceTimersByTimeAsync(14_000);
      const text = plain(w.seen);
      expect(text).toMatch(INTRO);
      expect(text).not.toContain('You may continue using the system');
      expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
      expect(w.repo.getPageRequest(w.session.tempData.pageId)!.sysopId).toBe('bot');
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for a caller who went into a door, and takes the page the moment they are back', async () => {
    const H = fresh();
    const w = makeWorld({ pageTimeout: 1 });
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;

    // The caller CTRL-C'd out of nothing - they were freed by an older build
    // that let them go, or the process restarted - and are now inside a door.
    w.session.subState = LoggedOnSubState.DOOR_RUNNING;
    w.session.doorInputHandler = () => {};
    await wait(2600);

    expect(w.repo.getPageRequest(pageId)!.status).toBe('pending');
    expect(plain(w.seen)).not.toMatch(INTRO);
    expect(w.session.subState).toBe(LoggedOnSubState.DOOR_RUNNING);

    // The door exits.
    w.session.doorInputHandler = null;
    w.session.subState = LoggedOnSubState.DISPLAY_MENU;
    await wait(2200);

    expect(w.repo.getPageRequest(pageId)!.sysopId).toBe('bot');
    expect(plain(w.seen)).toMatch(INTRO);
    expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
  });

  it("re-links a caller whose tempData a menu command wiped, so their line reaches the sysop's chat", async () => {
    const H = fresh();
    const w = makeWorld({ pageTimeout: 60 });
    H.initOperatorChatHandler(w.io, w.repo);
    expect(w.connectionHandler).toBeTruthy();

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;

    // The caller wandered: a menu command did `session.tempData = undefined`.
    w.session.tempData = undefined;
    w.session.subState = LoggedOnSubState.DISPLAY_MENU;

    // A human sysop accepts from the admin app.
    const handlers: Record<string, (d: any) => Promise<void>> = {};
    const sysopSocket: any = {
      id: 'sysop-sock', session: { user: { id: 'u-sysop', username: 'Spot', secLevel: 255 }, nodeId: 0 },
      on(ev: string, fn: any) { handlers[ev] = fn; }, emit() {}, join() {},
    };
    w.connectionHandler!(sysopSocket);
    await handlers['operator:accept-page']({ pageId });

    expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
    expect(w.session.tempData?.pageId).toBe(pageId);
    // express.e:6085-6087 prints the BOARD's sysop name (cmds.sysopName), not the
    // handle of whoever pressed accept.
    expect(plain(w.seen)).toMatch(/This is [^,]+, How can I help you\?\?/);

    // And the line they type goes INTO the chat, not to the menu.
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'are you there');
    await wait(300);
    expect(w.repo.getChatMessages(pageId).map((m: any) => m.message)).toContain('are you there');
  });

  it('refuses a sysop accept while the caller is inside a door, and says so', async () => {
    const H = fresh();
    const w = makeWorld({ pageTimeout: 60 });
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    w.session.subState = LoggedOnSubState.DOOR_RUNNING;
    w.session.doorInputHandler = () => {};

    const handlers: Record<string, (d: any) => Promise<void>> = {};
    const errors: any[] = [];
    const sysopSocket: any = {
      id: 'sysop-sock', session: { user: { id: 'u-sysop', username: 'Spot', secLevel: 255 }, nodeId: 0 },
      on(ev: string, fn: any) { handlers[ev] = fn; }, emit(ev: string, d: any) { if (ev === 'operator:error') errors.push(d); }, join() {},
    };
    w.connectionHandler!(sysopSocket);
    await handlers['operator:accept-page']({ pageId });

    expect(w.repo.getPageRequest(pageId)!.status).toBe('pending');
    expect(errors.map((e) => e.message).join(' ')).toMatch(/inside a door/);
    expect(plain(w.seen)).not.toContain('How can I help you');
  });

  it('reaches a WEB caller through the io socket map, and answers their line', async () => {
    const H = fresh();
    const w = makeWorld({ pageTimeout: 1, web: true, userId: 'u-web' });
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3200);

    expect(plain(w.seen)).toMatch(INTRO);
    expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);

    const before = w.seen.length;
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello from the browser');
    await wait(2500);
    const text = plain(w.seen.slice(before));
    // The caller's line went out as they typed it; what arrives is the reply.
    expect(text).toMatch(BOT_REPLY);
  });
});
