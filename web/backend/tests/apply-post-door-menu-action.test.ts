/**
 * Regression (Important 4, DD final-review wave, 2026-08-16): "Post-door
 * page-wait repaints main menu over a just-started chat."
 *
 * Sequence that triggered the bug: a FAME/FIM door mid-run pages the
 * sysop (notifySysopPage). After the door exits, executeAmigaDoor runs the
 * classic page-wait UX (chat.handler.ts's displayInternalPager/
 * completePaging). If the sysop accepts DURING that wait,
 * chat.handler.ts's acceptChat() -> enterChatMode() sets
 * session.inChat = true and session.subState/menuPause are left exactly as
 * completePaging() set them (DISPLAY_MENU / true) — the chat UI now owns
 * the screen. completePaging()'s onComplete then resolves the promise
 * executeAmigaDoor was awaiting, which used to fall straight into the
 * "Return to menu" block: it unconditionally reset menuPause=false and
 * called displayMainMenu, painting the main menu over the chat session the
 * user was just dropped into (input still routed to chat via
 * chat-mode-input.util.ts, so this was cosmetic but on the headline path).
 *
 * This must be a BEHAVIORAL test — not a source-grep pin — per the
 * reviewer finding: door-page-wait-sequencing.test.ts already source-grep
 * pins this exact function's structure and did NOT catch the bug, because
 * grepping for the presence of code proves nothing about what it does at
 * runtime. applyPostDoorMenuAction (extracted from executeAmigaDoor's
 * inline post-exit block specifically for this reason) is a plain
 * function that can be called directly with a mock socket and a spy
 * displayMainMenuFn, so the missing-repaint behavior is actually exercised.
 */
import "reflect-metadata";

jest.mock("../src/index", () => ({
  BBSState: { LOGGEDON: "loggedon", AWAIT: "await" },
  LoggedOnSubState: {},
}));

import { applyPostDoorMenuAction } from "../src/handlers/door.handler";
import { LoggedOnSubState } from "../src/constants/bbs-states";

type AnySession = Parameters<typeof applyPostDoorMenuAction>[1];

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

function chatSession(): AnySession {
  // Mirrors exactly what completePaging() (chat.handler.ts) leaves behind
  // right before onComplete() fires, plus what enterChatMode() already set
  // on this same session (acceptChat wires the paged user's own session
  // into chat mode before/independently of the dots-animation interval
  // noticing the chat session went 'active').
  return {
    state: "loggedon",
    user: { id: "user-1", username: "SPOT" },
    subState: LoggedOnSubState.DISPLAY_MENU,
    menuPause: true,
    inChat: true,
    chatSession: { id: "chat-1" },
  } as unknown as AnySession;
}

describe("applyPostDoorMenuAction", () => {
  it("does NOT call displayMainMenu when session.inChat is true (no menu repaint over the chat UI)", async () => {
    const socket = makeSocket();
    const session = chatSession();
    const displayMainMenuFn = jest.fn();

    await applyPostDoorMenuAction(socket, session, displayMainMenuFn);

    expect(displayMainMenuFn).not.toHaveBeenCalled();
  });

  it("does NOT emit anything on the socket when session.inChat is true", async () => {
    const socket = makeSocket();
    const session = chatSession();

    await applyPostDoorMenuAction(socket, session, jest.fn());

    expect(socket.emitted).toEqual([]);
  });

  it("leaves menuPause exactly as completePaging() set it (true) instead of clobbering it to false", async () => {
    const socket = makeSocket();
    const session = chatSession();

    await applyPostDoorMenuAction(socket, session, jest.fn());

    expect((session as any).menuPause).toBe(true);
  });

  it("leaves subState untouched when inChat (no DISPLAY_MENU clobber)", async () => {
    const socket = makeSocket();
    const session = chatSession();

    await applyPostDoorMenuAction(socket, session, jest.fn());

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it("control case: WITHOUT inChat, plain completion DOES call displayMainMenu and resets menuPause", async () => {
    const socket = makeSocket();
    const session = {
      state: "loggedon",
      user: { id: "user-1", username: "SPOT" },
      subState: LoggedOnSubState.DOOR_RUNNING,
      menuPause: true,
    } as unknown as AnySession;
    const displayMainMenuFn = jest.fn();

    await applyPostDoorMenuAction(socket, session, displayMainMenuFn);

    expect(displayMainMenuFn).toHaveBeenCalledTimes(1);
    expect(displayMainMenuFn).toHaveBeenCalledWith(socket, session);
    expect((session as any).menuPause).toBe(false);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
