/**
 * Regression tests for task 18 review round 2, finding #1: "Paged user
 * never enters chat mode after sysop accepts."
 *
 * express.e's chat()/ccom() (express.e:5916-6126, 20336-20378) run as ONE
 * process reading BOTH the local console (sysop) and the remote serial
 * line (caller) — conPuts()/serPuts() write each typed line to both
 * streams from that single loop, so "entering chat" and "sending a line"
 * are inherently two-sided in the original. This web port runs the sysop
 * and the paged user on two independent sockets/sessions, so acceptChat()
 * previously only wired the SYSOP's own session into chat mode
 * (chat.handler.ts:231-265 as reviewed) — the paged user was dropped back
 * to the main menu with no chat UI, and sendChatMessage() only echoed a
 * sender's own line back to themselves, so even a manually-patched user
 * session couldn't see the sysop's replies (or vice versa).
 *
 * These tests pin the fix: acceptChat wires BOTH sides into
 * enterChatMode/the shared chat room, sendChatMessage broadcasts to BOTH
 * parties, and exitChat (from either side) resets the counterpart too —
 * all via the SAME existing enterChatMode/exitChat/sendChatMessage
 * functions (no parallel chat mechanism).
 */
import "reflect-metadata";

jest.mock("../../src/services/webhook.service", () => ({
  webhookService: { sendWebhook: jest.fn(async () => undefined) },
  WebhookTrigger: { SYSOP_PAGED: "sysop_paged" },
}));

import { ChatHandler } from "../../src/handlers/chat/chat.handler";
import { ChatSessionUseCase } from "../../src/services/use-cases/chat-session.use-case";
import { LoggedOnSubState } from "../../src/constants/bbs-states";
import { userSessions, socketToUser } from "../../src/server/session-manager";
import type { BBSSession } from "../../src/index";

/** Minimal in-memory Socket.IO server: room membership + targeted emit. */
function makeIoServer() {
  const rooms = new Map<string, Set<string>>();
  const socketsById = new Map<string, any>();
  const io = {
    sockets: { sockets: socketsById },
    to(room: string) {
      return {
        emit(event: string, data?: unknown) {
          for (const socketId of rooms.get(room) ?? []) {
            socketsById.get(socketId)?.emit(event, data);
          }
        },
      };
    },
  };
  return { io, rooms, socketsById };
}

function makeSocket(id: string, io: any, rooms: Map<string, Set<string>>, socketsById: Map<string, any>) {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const socket: any = {
    id,
    emitted,
    emit: (event: string, data?: unknown) => {
      emitted.push({ event, data });
      return true;
    },
    join: (room: string) => {
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(id);
    },
    leave: (room: string) => {
      rooms.get(room)?.delete(id);
    },
    nsp: { server: io },
  };
  socketsById.set(id, socket);
  return socket;
}

function textOf(socket: any): string {
  return socket.emitted.filter((e: any) => e.event === "ansi-output").map((e: any) => String(e.data)).join("");
}

function makeSession(overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: "loggedon" as unknown as BBSSession["state"],
    subState: LoggedOnSubState.DISPLAY_MENU,
    ...overrides,
  } as BBSSession;
}

describe("sysop page chat handoff (task 18, round 2, finding #1)", () => {
  let useCase: ChatSessionUseCase;
  let handler: ChatHandler;
  let io: ReturnType<typeof makeIoServer>["io"];
  let rooms: Map<string, Set<string>>;
  let socketsById: Map<string, any>;

  let userSocket: any;
  let sysopSocket: any;
  let userSession: BBSSession;
  let sysopSession: BBSSession;

  beforeEach(() => {
    useCase = new ChatSessionUseCase();
    handler = new ChatHandler(useCase);

    userSessions.clear();
    socketToUser.clear();

    const server = makeIoServer();
    io = server.io;
    rooms = server.rooms;
    socketsById = server.socketsById;

    userSession = makeSession({ user: { id: "user-1", username: "SPOT", secLevel: 10 } as any });
    sysopSession = makeSession({ user: { id: "sysop-1", username: "OPERATOR", secLevel: 255 } as any });

    userSocket = makeSocket("sock-user", io, rooms, socketsById);
    sysopSocket = makeSocket("sock-sysop", io, rooms, socketsById);

    // Wire BOTH parties into session-manager's live lookup maps — exactly
    // what a real connected socket does — so resolveCounterpartSocket()
    // can find either side regardless of who initiates.
    userSessions.set("user-1", userSession);
    socketToUser.set("sock-user", "user-1");
    userSessions.set("sysop-1", sysopSession);
    socketToUser.set("sock-sysop", "sysop-1");
  });

  function pageAndAccept() {
    handler.notifySysopPage(userSession);
    const pending = useCase.getChatSessionByUser("user-1")!;
    const accepted = useCase.acceptChatSession(pending.id, "sysop-1")!;
    return accepted;
  }

  describe("acceptChat", () => {
    it("puts the PAGED USER's own session into chat mode, not just the sysop's", () => {
      // Use the real acceptChat path (not the pre-accepted helper above) so
      // acceptChatSession's own bookkeeping runs too.
      handler.notifySysopPage(userSession);
      const chatSession = useCase.getChatSessionByUser("user-1")!;

      handler.acceptChat(sysopSocket, sysopSession, chatSession);

      expect(sysopSession.inChat).toBe(true); // existing behavior preserved
      expect(userSession.inChat).toBe(true); // review fix
      expect((userSession.chatSession as any)?.id).toBe(chatSession.id);
    });

    it("emits chat-entry UX to the paged user's own socket", () => {
      handler.notifySysopPage(userSession);
      const chatSession = useCase.getChatSessionByUser("user-1")!;

      handler.acceptChat(sysopSocket, sysopSession, chatSession);

      const userText = textOf(userSocket);
      expect(userText).toMatch(/OPERATOR/); // sysop identified themselves
      expect(userText).toMatch(/Chat Mode Active|chat/i);
    });

    it("joins both sockets into the same chat room", () => {
      handler.notifySysopPage(userSession);
      const chatSession = useCase.getChatSessionByUser("user-1")!;

      handler.acceptChat(sysopSocket, sysopSession, chatSession);

      const room = `chat:${chatSession.id}`;
      expect(rooms.get(room)?.has("sock-user")).toBe(true);
      expect(rooms.get(room)?.has("sock-sysop")).toBe(true);
    });

    it("degrades gracefully (no throw) when the paged user is not currently connected", () => {
      userSessions.clear();
      socketToUser.clear();
      handler.notifySysopPage(userSession);
      const chatSession = useCase.getChatSessionByUser("user-1")!;

      expect(() => handler.acceptChat(sysopSocket, sysopSession, chatSession)).not.toThrow();
      expect(sysopSession.inChat).toBe(true); // sysop side still works
    });
  });

  describe("sendChatMessage — both parties see both directions", () => {
    it("the paged user's message reaches the sysop's socket too, not just their own echo", () => {
      const chatSession = pageAndAccept();
      handler.enterChatMode(userSocket, userSession, chatSession);
      handler.enterChatMode(sysopSocket, sysopSession, chatSession);
      userSocket.join(`chat:${chatSession.id}`);
      sysopSocket.join(`chat:${chatSession.id}`);

      handler.sendChatMessage(userSocket, userSession, "hello sysop");

      expect(textOf(userSocket)).toMatch(/hello sysop/);
      expect(textOf(sysopSocket)).toMatch(/hello sysop/);
    });

    it("the sysop's reply reaches the paged user's socket too", () => {
      const chatSession = pageAndAccept();
      handler.enterChatMode(userSocket, userSession, chatSession);
      handler.enterChatMode(sysopSocket, sysopSession, chatSession);
      userSocket.join(`chat:${chatSession.id}`);
      sysopSocket.join(`chat:${chatSession.id}`);

      handler.sendChatMessage(sysopSocket, sysopSession, "how can I help");

      expect(textOf(sysopSocket)).toMatch(/how can I help/);
      expect(textOf(userSocket)).toMatch(/how can I help/);
    });
  });

  describe("exitChat — ends the session for BOTH parties", () => {
    it("sysop exiting resets the paged user's session and notifies their socket", () => {
      const chatSession = pageAndAccept();
      handler.enterChatMode(userSocket, userSession, chatSession);
      handler.enterChatMode(sysopSocket, sysopSession, chatSession);
      userSocket.join(`chat:${chatSession.id}`);
      sysopSocket.join(`chat:${chatSession.id}`);

      handler.exitChat(sysopSocket, sysopSession);

      expect(sysopSession.inChat).toBeUndefined();
      expect(userSession.inChat).toBeUndefined();
      expect(userSession.chatSession).toBeUndefined();
      expect(userSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(textOf(userSocket)).toMatch(/Chat session ended/);
    });

    it("the paged user exiting resets the sysop's session too", () => {
      const chatSession = pageAndAccept();
      handler.enterChatMode(userSocket, userSession, chatSession);
      handler.enterChatMode(sysopSocket, sysopSession, chatSession);
      userSocket.join(`chat:${chatSession.id}`);
      sysopSocket.join(`chat:${chatSession.id}`);

      handler.exitChat(userSocket, userSession);

      expect(userSession.inChat).toBeUndefined();
      expect(sysopSession.inChat).toBeUndefined();
      expect(sysopSession.chatSession).toBeUndefined();
      expect(textOf(sysopSocket)).toMatch(/Chat session ended/);
    });
  });
});
