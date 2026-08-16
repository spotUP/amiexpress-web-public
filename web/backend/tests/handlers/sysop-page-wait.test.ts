/**
 * Regression tests for task 18: interactive sysop page-wait after a
 * FAME/FIM door exits.
 *
 * Sequence under test (chat.handler.ts's ChatHandler class — the standalone
 * exported functions used by AmigaDoorSession.ts / door.handler.ts are thin
 * DI-container delegations over these same methods, matching every other
 * export in this file):
 *
 *   1. CF_InternalCmd "C" (5D_Page etc.) calls notifySysopPage(session)
 *      DURING the door run. It must set session.sysopPagePending +
 *      session.sysopPageChatSessionId WITHOUT emitting any pager UI on the
 *      socket (the door owns its own screen while running).
 *   2. AFTER the door exits, door.handler.ts calls
 *      runPendingSysopPageWait(socket, session, onComplete), which reuses
 *      the SAME chat session (no duplicate) and drives the ported
 *      displayInternalPager/completePaging dots-animation + timeout +
 *      sysop-answer loop — WITHOUT ever calling executePagerDoor (which
 *      would recursively launch the PowerPager door).
 *
 * express.e:20336-20378 (ccom()) is the source of truth for the
 * animation/timeout/sysop-answer sequencing being mirrored here: a tick
 * loop that (a) checks for the sysop having answered on every tick and
 * returns immediately if so, (b) otherwise ticks a dot every second for a
 * fixed window, then (c) prints "The Sysop has been paged ... until
 * <sysop> answers your request."
 */
import "reflect-metadata";

// notifySysopPage fires an unawaited webhook (webhookService.sendWebhook);
// mock it so tests don't touch the real DB/network and don't log after the
// test finishes.
jest.mock("../../src/services/webhook.service", () => ({
  webhookService: { sendWebhook: jest.fn(async () => undefined) },
  WebhookTrigger: { SYSOP_PAGED: "sysop_paged" },
}));

import { ChatHandler, setHelpers } from "../../src/handlers/chat/chat.handler";
import { ChatSessionUseCase } from "../../src/services/use-cases/chat-session.use-case";
import { LoggedOnSubState } from "../../src/constants/bbs-states";
import type { BBSSession } from "../../src/index";

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    emit: (event: string, data?: unknown) => {
      emitted.push({ event, data });
      return true;
    },
  };
}

function makeSession(overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: "loggedon" as unknown as BBSSession["state"],
    subState: LoggedOnSubState.DOOR_RUNNING,
    user: { id: "user-1", username: "SPOT" },
    ...overrides,
  } as BBSSession;
}

describe("sysop page-wait (task 18)", () => {
  let useCase: ChatSessionUseCase;
  let handler: ChatHandler;
  let executePagerDoorMock: jest.Mock;
  let displayMainMenuMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    useCase = new ChatSessionUseCase();
    handler = new ChatHandler(useCase);
    // startSysopPage() would try executePagerDoor to launch PowerPager;
    // runPendingSysopPageWait must bypass it entirely (recursion guard).
    executePagerDoorMock = jest.fn(() => false);
    displayMainMenuMock = jest.fn();
    setHelpers({
      executePagerDoor: executePagerDoorMock,
      displayMainMenu: displayMainMenuMock,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('notifySysopPage — flag set by CF_InternalCmd "C" during the door run', () => {
    it("sets sysopPagePending and sysopPageChatSessionId, without touching the socket", () => {
      const session = makeSession();
      const ok = handler.notifySysopPage(session);

      expect(ok).toBe(true);
      expect(session.sysopPagePending).toBe(true);
      expect(typeof session.sysopPageChatSessionId).toBe("string");
      expect(session.sysopPageChatSessionId!.length).toBeGreaterThan(0);

      // The chat session referenced by the flag really exists and is
      // still in the 'paging' state (not yet answered).
      const chatSession = useCase.getChatSession(session.sysopPageChatSessionId!);
      expect(chatSession).not.toBeNull();
      expect(chatSession!.status).toBe("paging");
    });

    it("does nothing when the session has no logged-in user", () => {
      const session = makeSession({ user: undefined });
      const ok = handler.notifySysopPage(session);

      expect(ok).toBe(false);
      expect(session.sysopPagePending).toBeUndefined();
      expect(session.sysopPageChatSessionId).toBeUndefined();
    });
  });

  describe("runPendingSysopPageWait — page-wait triggered after exit, not during", () => {
    it("is a no-op when no page is pending (nothing was requested during the door run)", () => {
      const socket = makeSocket();
      const session = makeSession();
      const onComplete = jest.fn();

      const started = handler.runPendingSysopPageWait(socket, session, onComplete);

      expect(started).toBe(false);
      expect(socket.emitted.length).toBe(0);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("consumes the pending flag and starts the dots animation only once explicitly invoked (post-exit)", () => {
      const socket = makeSocket();
      const session = makeSession();
      handler.notifySysopPage(session); // simulates the "C" internal command mid-door

      // Nothing pager-related reached the socket yet — proves the wait
      // does not run DURING the door (notifySysopPage is silent).
      expect(socket.emitted.length).toBe(0);

      const onComplete = jest.fn();
      const started = handler.runPendingSysopPageWait(socket, session, onComplete);

      expect(started).toBe(true);
      // Flag is consumed immediately so a second call can't double-fire.
      expect(session.sysopPagePending).toBe(false);
      expect(
        socket.emitted.some(e => e.event === "ansi-output" && /Paging/.test(String(e.data)))
      ).toBe(true);
      expect(onComplete).not.toHaveBeenCalled(); // still waiting
    });

    it("never calls executePagerDoor (no recursive PowerPager launch)", () => {
      const socket = makeSocket();
      const session = makeSession();
      handler.notifySysopPage(session);

      handler.runPendingSysopPageWait(socket, session, jest.fn());
      jest.advanceTimersByTime(31_000);

      expect(executePagerDoorMock).not.toHaveBeenCalled();
    });

    it("a second call after the flag is already consumed is a no-op (idempotent)", () => {
      const socket = makeSocket();
      const session = makeSession();
      handler.notifySysopPage(session);

      const first = handler.runPendingSysopPageWait(socket, session, jest.fn());
      expect(first).toBe(true);

      const second = handler.runPendingSysopPageWait(socket, session, jest.fn());
      expect(second).toBe(false);
    });
  });

  describe("timeout path (no sysop answer within the animation window)", () => {
    it("ticks dots once per second, then prints the classic paged-and-continue message and resolves onComplete", () => {
      const socket = makeSocket();
      const session = makeSession();
      handler.notifySysopPage(session);

      const onComplete = jest.fn();
      handler.runPendingSysopPageWait(socket, session, onComplete);

      // Advance through the full 30-dot window.
      jest.advanceTimersByTime(30_000);

      const outputs = socket.emitted.filter(e => e.event === "ansi-output").map(e => String(e.data));
      const dotTicks = outputs.filter(o => o === " .").length;
      expect(dotTicks).toBe(30);

      const finalText = outputs.join("");
      expect(finalText).toMatch(/The Sysop has been paged/);
      expect(finalText).toMatch(/until .* answers your request/i);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(session.pagingInterval).toBeUndefined(); // interval cleaned up, no leak
    });
  });

  describe("sysop-answer path (express.e ccom(): chatF check ends the wait early)", () => {
    it("ends the wait as soon as the chat session is accepted, before the timeout elapses", () => {
      const socket = makeSocket();
      const session = makeSession();
      handler.notifySysopPage(session);

      const onComplete = jest.fn();
      handler.runPendingSysopPageWait(socket, session, onComplete);

      // Tick a few seconds in — sysop hasn't answered yet.
      jest.advanceTimersByTime(5_000);
      expect(onComplete).not.toHaveBeenCalled();

      // Sysop accepts the SAME chat session created by notifySysopPage.
      // runPendingSysopPageWait already consumed session.sysopPageChatSessionId
      // (cleared it up front so it can't double-fire), so the still-active
      // chat session is looked up by user id instead — exactly what a real
      // sysop-side "accept page" handler does.
      const pendingChatSession = useCase.getChatSessionByUser(session.user!.id);
      expect(pendingChatSession).not.toBeNull();
      const accepted = useCase.acceptChatSession(pendingChatSession!.id, "sysop-1");
      expect(accepted).not.toBeNull();

      // Next tick after acceptance should end the wait well short of 30s.
      jest.advanceTimersByTime(1_000);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(session.pagingInterval).toBeUndefined();

      const outputs = socket.emitted.filter(e => e.event === "ansi-output").map(e => String(e.data));
      const dotTicks = outputs.filter(o => o === " .").length;
      expect(dotTicks).toBeLessThan(30);

      // Must NOT show the "until sysop answers" timeout message — the
      // sysop already answered.
      const finalText = outputs.join("");
      expect(finalText).not.toMatch(/until .* answers your request/i);
    });
  });
});
