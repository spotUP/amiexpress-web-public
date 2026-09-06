/**
 * TP-10 - ONE registry for cross-session pushes.
 *
 * Task TP-10 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`.
 *
 * Every one of these cases names a symptom a sysop would report - "I cannot
 * kick a telnet caller", "my OLM went nowhere", "the caller never saw my chat
 * line", "he was never invited" - and drives the REAL handler that produces it
 * against a REAL `TelnetConnection` over a stub `net.Socket`, reading the bytes
 * the SOCKET received.
 *
 * THE MOCK-WRITE BAN (TP-1, kept by TP-5) APPLIES HERE TOO. A fake
 * `connection.write` would make every one of these pass while proving nothing
 * about what a telnet caller actually receives, so the connection is real, the
 * emitter is the production one built by `setupTelnetSSHHandler`, and the
 * suite asserts the ban against its own source below.
 *
 * `src/index.ts` is mocked away: it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    LOCALHOST_IPS: [],
  };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
/**
 * The bot's reply is an ANSI push to the paged caller exactly as the sysop's
 * own line is, so the bot case below needs the reply and nothing else the bot
 * module does. Only the response function is replaced; the intro is kept real.
 */
jest.mock('../../src/handlers/grumpy-sysop-bot.handler', () => ({
  ...jest.requireActual('../../src/handlers/grumpy-sysop-bot.handler'),
  getGrumpySysopResponse: jest.fn(async () => 'WHAT DO YOU WANT'),
}));
jest.mock('../../src/services/CallersLogManager');

/**
 * THE CALL-COUNT SENTINEL (REACHABILITY_PROTOCOL gate 3b).
 *
 * A module-boundary counter, not a spy: ts-jest binds intra-module calls
 * locally, so a spy on an export records zero whether the path ran or not, and
 * `jest.spyOn` on these getter-only exports throws outright (TP-3's D20, TP-5's
 * D29). This delegating mock keeps the REAL bodies - `requireActual` - and only
 * counts the crossings, so every case below both asserts its bytes AND proves
 * which lookup produced them. The counters are validated in both directions
 * inside the kick case: the same driver against a node with no session leaves
 * the LIVE count incremented and the wire empty.
 */
const mockRegistryCalls = {
  emitterForSession: 0,
  emitterForNodeId: 0,
  emitterForUserId: 0,
  socketIoSocketFor: 0,
};
jest.mock('../../src/server/session-emitter-registry', () => {
  const actual = jest.requireActual('../../src/server/session-emitter-registry');
  return {
    ...actual,
    emitterForSession: (...args: unknown[]) => {
      mockRegistryCalls.emitterForSession += 1;
      return (actual.emitterForSession as (...a: unknown[]) => unknown)(...args);
    },
    emitterForNodeId: (...args: unknown[]) => {
      mockRegistryCalls.emitterForNodeId += 1;
      return (actual.emitterForNodeId as (...a: unknown[]) => unknown)(...args);
    },
    emitterForUserId: (...args: unknown[]) => {
      mockRegistryCalls.emitterForUserId += 1;
      return (actual.emitterForUserId as (...a: unknown[]) => unknown)(...args);
    },
    socketIoSocketFor: (...args: unknown[]) => {
      mockRegistryCalls.socketIoSocketFor += 1;
      return (actual.socketIoSocketFor as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import { TelnetConnection } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler } from '../../src/server/transport-session';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import {
  emitterForNodeId,
  emitterForSession,
  emitterForUserId,
  socketIoSocketFor,
} from '../../src/server/session-emitter-registry';
import {
  sessions as sessionMap,
  userSessions,
  setSession,
  deleteSession,
} from '../../src/server/session-manager';
import {
  handleNMConfirm,
  setMessageCommandsDependencies,
} from '../../src/handlers/message/message-commands.handler';
import { handleOlmCommand, setOlmDependencies } from '../../src/handlers/transfer/olm.handler';
import {
  handleUserChatMessage,
  getActiveChatSessions,
} from '../../src/handlers/operator-chat.handler';
import {
  handleChatRequest,
  setInternodeChatDependencies,
} from '../../src/handlers/chat/internode-chat.handler';
import express from 'express';
import request from 'supertest';
import { createNodeControlRouter } from '../../src/api/node-control-routes';
import type { BBSSession } from '../../src/index';

/**
 * The stub `net.Socket` every case is driven over. Only the members
 * `TelnetConnection`'s constructor and write path touch.
 */
class StubNetSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1';
  public written: Buffer[] = [];
  public ended = 0;

  constructor() {
    super();
    this.write = this.write.bind(this);
  }

  write(data: Buffer | string): boolean {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
    return true;
  }

  end(): void {
    this.ended += 1;
  }

  /** Bytes written since `from`, as latin1 text. */
  since(from: number): string {
    return Buffer.concat(this.written.slice(from)).toString('latin1');
  }
}

/** A socket.io-shaped stub for the WEB half of the registry's answer. */
function fakeIoSocket(id: string) {
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const rooms: string[] = [];
  const left: string[] = [];
  return {
    id,
    connected: true,
    emitted,
    rooms,
    left,
    emit(event: string, ...args: unknown[]) {
      emitted.push({ event, args });
      return true;
    },
    join(room: string) {
      rooms.push(room);
    },
    leave(room: string) {
      left.push(room);
    },
    on() {
      return this;
    },
    off() {
      return this;
    },
    disconnect() {
      return this;
    },
  };
}

/**
 * A socket.io server stub. `to()` is kept live because the STRUCTURED events
 * beside every push this task rewrites (`chat:*`, `operator:*`, `room:*`) are
 * web-only by the transport adapter's ruling table and still address the room -
 * `roomEmits` is how a case can assert that they were not moved.
 */
function ioWith(...sockets: Array<{ id: string }>) {
  const map = new Map<string, unknown>();
  for (const s of sockets) map.set(s.id, s);
  const roomEmits: Array<{ room: string; event: string; args: unknown[] }> = [];
  return {
    sockets: { sockets: map, adapter: { rooms: new Map<string, Set<string>>() } },
    roomEmits,
    emit: () => true,
    to(room: string) {
      return {
        emit: (event: string, ...args: unknown[]) => {
          roomEmits.push({ room, event, args });
          return true;
        },
      };
    },
  } as never;
}

function telnetSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    user: {
      id: nodeId,
      username: `TELNET${nodeId}`,
      secLevel: 255,
      securityFlags: 'T'.repeat(90),
      availableForChat: true,
    },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    cmdShortcuts: false,
    doorExpertMode: false,
    connectionType: 'telnet',
    terminalType: 'ansi',
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
    ...overrides,
  } as unknown as BBSSession;
}

/**
 * A telnet caller taken all the way through the PRODUCTION entry point.
 *
 * `setupTelnetSSHHandler` is what `index.ts` hands every telnet connection to,
 * and it is where the session is bound to its connection emitter. Nothing here
 * is a test-only shortcut: registration, the data handler and the close handler
 * are the real ones.
 */
function realTelnetCaller(nodeId: number, overrides: Partial<BBSSession> = {}) {
  const socket = new StubNetSocket();
  const connection = new TelnetConnection(socket as unknown as import('net').Socket);
  // In production every connection gets its own node and its own session id
  // (`telnet-<node>-<ms>`, telnet-server.ts). Here `getNextAvailableNodeId()`
  // sees a sessions map this suite fills itself and hands every connection
  // node 1, so two callers built in the same millisecond would SHARE a session
  // id and the second `setSession` would evict the first from socketToNodeId.
  // Restoring the production invariant - one node, one id per caller - is what
  // these two lines do; nothing else about the connection is touched.
  const identified = connection as unknown as { sessionId: string; nodeId: number };
  identified.nodeId = nodeId;
  identified.sessionId = `telnet-${nodeId}-test`;
  const session = telnetSession(nodeId, overrides);
  connection.session = session;
  setSession(connection.sessionId, session);
  setupTelnetSSHHandler(connection, 'telnet', {
    io: ioWith(),
    sessions: sessionMap,
    nodeManager: { releaseSession: async () => undefined },
    handleCommand: () => undefined,
  });
  // initializeTelnet() wrote seven negotiation commands in the constructor.
  const preamble = socket.written.length;
  return { socket, connection, session, preamble };
}

const openCallers: Array<{ connection: TelnetConnection; session: BBSSession }> = [];

function caller(nodeId: number, overrides: Partial<BBSSession> = {}) {
  const made = realTelnetCaller(nodeId, overrides);
  openCallers.push({ connection: made.connection, session: made.session });
  return made;
}

beforeEach(() => {
  mockRegistryCalls.emitterForSession = 0;
  mockRegistryCalls.emitterForNodeId = 0;
  mockRegistryCalls.emitterForUserId = 0;
  mockRegistryCalls.socketIoSocketFor = 0;
});

afterEach(() => {
  for (const open of openCallers.splice(0)) {
    deleteSession(open.connection.sessionId);
    if (open.session.user?.id !== undefined) userSessions.delete(String(open.session.user.id));
  }
  sessionMap.clear();
  userSessions.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('TP-10 - one registry, so a cross-session push finds a byte terminal', () => {
  it('this suite never fakes the write that carries the bytes', () => {
    const source = String(readFileSync(__filename));
    expect(source).not.toMatch(/write:\s*\(/);
  });

  it('a telnet caller can be kicked', () => {
    const sysopEmitted: Array<{ event: string; args: unknown[] }> = [];
    const sysopSocket = fakeIoSocket('tp10-sysop');
    sysopSocket.emit = (event: string, ...args: unknown[]) => {
      sysopEmitted.push({ event, args });
      return true;
    };

    const { socket, session: victim, preamble } = caller(41);
    victim.currentStat = 0;
    const sysopSession = telnetSession(42, { connectionType: 'web' });
    sessionMap.set('42', sysopSession);

    setMessageCommandsDependencies({
      messageBases: [],
      conferences: [],
      sessions: sessionMap,
      io: ioWith() as never,
      joinConference: async () => true,
      displayScreen: () => true,
      resetNewMailScanPointers: async () => 0,
      resetLastMessageReadPointers: async () => 0,
      getConferenceStats: async () => ({}),
      updateMessageNumberRange: async () => true,
      getMailStatFile: async () => ({}),
    });

    jest.useFakeTimers();
    sysopSession.tempData = { nmNode: 41, nmOp: 'kick' };
    handleNMConfirm(sysopSocket as never, sysopSession, 'Y');
    // The kick's own 500 ms disconnect timer, not the 1000 ms node-list repaint.
    jest.advanceTimersByTime(600);
    flushAllBuffers();

    expect(socket.since(preamble)).toContain('*** Disconnected by SYSOP ***');
    expect(socket.ended).toBeGreaterThan(0);
    expect(victim.sysopKicked).toBe(true);
    // And the sysop is NOT told the node could not be found.
    const sysopText = sysopEmitted.map((e) => String(e.args[0])).join('');
    expect(sysopText).not.toContain('Could not');
    // The sentinel: the kick crossed the registry exactly once.
    expect(mockRegistryCalls.emitterForNodeId).toBe(1);

    // INSTRUMENT VALIDATION (protocol section 3) - the DEAD direction. The
    // same driver against a node that has no session increments the same
    // counter and produces no bytes and no close, so a passing case above
    // cannot be the counter reporting LIVE for everything.
    const wireBefore = socket.written.length;
    sysopSession.tempData = { nmNode: 99, nmOp: 'kick' };
    handleNMConfirm(sysopSocket as never, sysopSession, 'Y');
    jest.advanceTimersByTime(600);
    flushAllBuffers();
    expect(mockRegistryCalls.emitterForNodeId).toBe(2);
    expect(socket.since(wireBefore)).toBe('');
    expect(sysopEmitted.map((e) => String(e.args[0])).join('')).toContain(
      'Could not disconnect node 99',
    );
  });

  it('a telnet caller at the command prompt receives an OLM immediately', async () => {
    const { socket, session: recipient, preamble } = caller(43, {
      subState: LoggedOnSubState.READ_COMMAND,
    });
    const { session: sender } = caller(44);

    setOlmDependencies({
      db: {},
      sessions: sessionMap,
      io: ioWith(),
      setEnvStat: () => undefined,
      config: { get: (key: string) => (key === 'olmEnabled' ? true : undefined) },
    });

    const senderSocket = fakeIoSocket('tp10-olm-sender');
    await handleOlmCommand(senderSocket as never, sender, '43 ARE YOU THERE');
    flushAllBuffers();

    const wire = socket.since(preamble);
    expect(wire).toContain('Online Message!');
    expect(wire).toContain('ARE YOU THERE');
    // The immediate branch was taken, so nothing is left waiting in the queue.
    expect(recipient.olmQueue ?? []).toHaveLength(0);
    expect(recipient.olmBuffer ?? []).toHaveLength(0);
    // The sentinel: one registry crossing per packet (header, body, footer).
    expect(mockRegistryCalls.emitterForSession).toBeGreaterThanOrEqual(1);
  });

  it('a telnet caller in operator chat sees the chat window, not silence', async () => {
    const { socket, session, preamble } = caller(45);
    userSessions.set(String(session.user.id), session);
    session.tempData = { pageId: 'page-45' };

    const page = {
      id: 'page-45',
      userId: String(session.user.id),
      userHandle: session.user.username,
      nodeId: 45,
      conferenceName: 'Main',
      createdAt: new Date(),
    };
    const repository = {
      getPageRequest: () => page,
      addChatMessage: (msg: unknown) => msg,
      updatePageStatus: () => undefined,
    };

    getActiveChatSessions().set('page-45', {
      pageId: 'page-45',
      userId: page.userId,
      userHandle: page.userHandle,
      userNodeId: 45,
      sysopId: 'sysop',
      sysopHandle: 'Sysop',
      sysopSessionId: 'tp10-sysop-socket',
      startedAt: new Date(),
      lastActivity: new Date(),
      messages: [],
      isTyping: { user: false, sysop: false },
    } as never);

    const ioServer = ioWith();
    try {
      await handleUserChatMessage(ioServer, repository as never, session, 'HELLO SYSOP');
      flushAllBuffers();
      expect(socket.since(preamble)).toContain('HELLO SYSOP');
      expect(mockRegistryCalls.emitterForUserId).toBeGreaterThanOrEqual(1);
      // The structured half is still addressed to the sysop panel's room.
      const rooms = (ioServer as unknown as { roomEmits: Array<{ room: string; event: string }> })
        .roomEmits;
      expect(rooms.some((r) => r.room === 'page:page-45' && r.event === 'operator:message')).toBe(
        true,
      );
    } finally {
      getActiveChatSessions().delete('page-45');
    }
  });

  it('a telnet caller is invited to an internode chat', async () => {
    const { socket, session: target, preamble } = caller(46);
    const { session: initiator } = caller(47);

    setInternodeChatDependencies({
      db: {
        getUserByUsernameForOLM: async () => ({
          id: target.user.id,
          username: target.user.username,
          availableForChat: true,
        }),
        createChatSession: async () => 'chat-46',
        getChatSession: async () => null,
      },
      sessions: sessionMap,
      io: ioWith(),
    });

    jest.useFakeTimers();
    const initiatorSocket = fakeIoSocket('tp10-initiator');
    await handleChatRequest(initiatorSocket as never, initiator, {
      targetUsername: target.user.username,
    });
    flushAllBuffers();

    expect(socket.since(preamble)).toContain('wants to chat with you, accept (Y/n)?');
    expect(target.subState).toBe(LoggedOnSubState.LIVECHAT_INVITATION_RESPONSE);
    expect(mockRegistryCalls.emitterForSession).toBeGreaterThanOrEqual(1);
  });

  it('a reconnected web caller is resolved through the LIVE socket, never the dead one', () => {
    // The trap the PETSCII plan recorded: `session.socket` is assigned once and
    // is the DEAD socket after a reconnect, because the restore updates
    // `socketId` and calls setSession without reassigning it. The registry
    // never reads `session.socket`.
    const dead = fakeIoSocket('web-socket-old');
    const live = fakeIoSocket('web-socket-new');
    const session = telnetSession(48, { connectionType: 'web' });
    (session as unknown as { socket: unknown }).socket = dead;
    session.socketId = 'web-socket-new';

    const resolved = emitterForSession(session, ioWith(live));
    expect(resolved).toBe(live);

    resolved?.emit('ansi-output', 'AFTER THE RECONNECT');
    expect(live.emitted).toHaveLength(1);
    expect(dead.emitted).toHaveLength(0);
  });

  it('room membership still uses a real socket, and skips a byte transport', () => {
    const live = fakeIoSocket('web-socket-room');
    const webSession = telnetSession(49, { connectionType: 'web' });
    webSession.socketId = 'web-socket-room';
    const { session: telnetCaller } = caller(50);
    const io = ioWith(live);

    expect(socketIoSocketFor(webSession, io)).toBe(live);
    expect(socketIoSocketFor(telnetCaller, io)).toBeNull();

    // The internode chat-end cleanup's idiom, on both transports: the byte
    // caller is in no room and the optional call simply skips.
    expect(() => socketIoSocketFor(webSession, io)?.leave('chat:x')).not.toThrow();
    expect(() => socketIoSocketFor(telnetCaller, io)?.leave('chat:x')).not.toThrow();
    expect(live.left).toEqual(['chat:x']);

    // A byte caller is still REACHABLE - it just is not reachable by room.
    expect(emitterForSession(telnetCaller, io)).not.toBeNull();
  });

  it('a closed connection is no longer reachable', () => {
    const { connection, session } = caller(51);
    userSessions.set(String(session.user.id), session);

    expect(emitterForNodeId(51)).not.toBeNull();
    expect(emitterForUserId(String(session.user.id))).not.toBeNull();

    // The REAL close handler, the one telnet-server.ts fires on socket close.
    connection.emit('close');

    expect(emitterForSession(session)).toBeNull();
    expect(emitterForNodeId(51)).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(session, 'connectionEmitter'),
    ).toBe(false);
  });

  /**
   * The two cases below cover the sites the recovered patch had NOT converted:
   * the admin dashboard's own kick route, which TP-10's inventory names as
   * site 1, and the grumpy bot's reply, which landed on main after TP-10 was
   * written and is the operator chat's terminal half exactly as the sysop's
   * own line is.
   */
  it('a telnet caller can be kicked from the admin dashboard', async () => {
    const { socket, session: victim, preamble } = caller(52);
    const app = express();
    app.use(express.json());
    app.use('/api/nodes', createNodeControlRouter(ioWith()));

    const res = await request(app).post('/api/nodes/52/kick').send({ reason: 'GO AWAY' });
    flushAllBuffers();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The notice is a `system-message`, which the transport adapter RENDERS on
    // a byte transport (TP-4) - so it is on the wire, not dropped.
    const wire = socket.since(preamble);
    expect(wire).toContain('Disconnected by the sysop: GO AWAY');
    expect(socket.ended).toBeGreaterThan(0);
    expect(mockRegistryCalls.emitterForNodeId).toBe(1);
    expect(victim.nodeId).toBe(52);

    // The dead direction: a node with no session answers 404 and writes nothing.
    const wireBefore = socket.written.length;
    // A body is sent because the route destructures req.body unconditionally;
    // an empty POST is a 500 on this express, at HEAD as well as here.
    const miss = await request(app).post('/api/nodes/98/kick').send({});
    flushAllBuffers();
    expect(miss.status).toBe(404);
    expect(socket.since(wireBefore)).toBe('');
  });

  it("a telnet caller sees the grumpy bot's reply, not an empty scroll region", async () => {
    const { socket, session, preamble } = caller(53);
    userSessions.set(String(session.user.id), session);
    session.tempData = { pageId: 'page-53' };

    const page = {
      id: 'page-53',
      userId: String(session.user.id),
      userHandle: session.user.username,
      nodeId: 53,
      conferenceName: 'Main',
      createdAt: new Date(),
    };
    const repository = {
      getPageRequest: () => page,
      addChatMessage: (msg: unknown) => msg,
      updatePageStatus: () => undefined,
      getConfig: () => ({
        aiEnabled: false,
        aiProvider: 'rule-based',
        botThinkTime: 0,
        botTypingSpeed: 0,
        botTypoProbability: 0,
      }),
    };

    getActiveChatSessions().set('page-53', {
      pageId: 'page-53',
      userId: page.userId,
      userHandle: page.userHandle,
      userNodeId: 53,
      sysopId: 'bot',
      sysopHandle: 'GrumpyBot',
      sysopSessionId: 'tp10-bot-socket',
      startedAt: new Date(),
      lastActivity: new Date(),
      messages: [],
      isTyping: { user: false, sysop: false },
      isBotControlled: true,
    } as never);

    try {
      await handleUserChatMessage(ioWith(), repository as never, session, 'HELLO?');
      // The bot answers on a resolved promise; let the microtask chain drain.
      await new Promise((resolve) => setTimeout(resolve, 20));
      flushAllBuffers();

      const wire = socket.since(preamble);
      // The caller's own line (queued while the bot was busy, then flushed)
      // AND the bot's reply both crossed.
      expect(wire).toContain('HELLO?');
      expect(wire).toContain('WHAT DO YOU WANT');
      expect(mockRegistryCalls.emitterForUserId).toBeGreaterThanOrEqual(2);
    } finally {
      getActiveChatSessions().delete('page-53');
    }
  });
});
