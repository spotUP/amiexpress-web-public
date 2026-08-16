/**
 * Regression tests for task 18 review round 3: "stale session.inputBuffer
 * leaks across chat-mode boundaries."
 *
 * Two real leak paths existed before this fix:
 *   1. Entry leak — enterChatMode() didn't clear session.inputBuffer, so
 *      whatever the user had half-typed at the menu prompt (READ_COMMAND
 *      only does a falsy-guard, not clear-on-entry — command.handler.ts:
 *      3661-3663) silently prepended onto their FIRST chat message.
 *   2. Exit leak — the F1-exit branch in socket-handlers.ts returned
 *      immediately after calling exitChat(), before ever reaching the
 *      separate buffering branch that would otherwise have cleared
 *      inputBuffer on Enter — a mid-line F1 press left the partial chat
 *      text sitting in session.inputBuffer for the NEXT command to
 *      silently inherit.
 *
 * These tests drive the actual extracted routing function
 * (chat-mode-input.util.ts's handleChatModeInput — the "smallest
 * testable extraction" of socket-handlers.ts's per-character input
 * branch) together with the REAL enterChatMode/exitChat (via a
 * registered ChatHandler instance, so the module-level exitChat/
 * sendChatMessage that handleChatModeInput calls resolve to the SAME
 * handler/use-case as the test — no mocking of the routing or the state
 * transitions under test).
 */
import "reflect-metadata";

jest.mock("../../src/services/webhook.service", () => ({
  webhookService: { sendWebhook: jest.fn(async () => undefined) },
  WebhookTrigger: { SYSOP_PAGED: "sysop_paged" },
}));

import { handleChatModeInput } from "../../src/utils/chat-mode-input.util";
import { ChatHandler } from "../../src/handlers/chat/chat.handler";
import { ChatSessionUseCase } from "../../src/services/use-cases/chat-session.use-case";
import { container } from "../../src/container";
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
    subState: LoggedOnSubState.DISPLAY_MENU,
    inputBuffer: "",
    ...overrides,
  } as BBSSession;
}

describe("handleChatModeInput — inputBuffer leak fix (task 18, review round 3)", () => {
  let useCase: ChatSessionUseCase;
  let handler: ChatHandler;

  beforeEach(() => {
    useCase = new ChatSessionUseCase();
    handler = new ChatHandler(useCase);
    // Register into the SAME tsyringe container that the module-level
    // exitChat()/sendChatMessage() (called internally by
    // handleChatModeInput) resolve through, so this test exercises the
    // real production call path end-to-end rather than a hand-rolled
    // substitute.
    container.register(ChatSessionUseCase, { useValue: useCase });
    container.register(ChatHandler, { useValue: handler });
  });

  it("returns false and leaves inputBuffer untouched when the session isn't in chat mode", () => {
    const socket = makeSocket();
    const session = makeSession({ inputBuffer: "READ" });

    const handled = handleChatModeInput(socket, session, "x");

    expect(handled).toBe(false);
    expect(session.inputBuffer).toBe("READ");
  });

  it('entry leak: enterChatMode clears a stale menu-command buffer, so the FIRST chat message has no stale prefix', () => {
    const socket = makeSocket();
    // Simulates a user who had half-typed "READ" at the menu prompt the
    // instant the sysop answered their page.
    const session = makeSession({
      user: { id: "user-1", username: "SPOT", secLevel: 10 } as any,
      inputBuffer: "REA",
    });

    const chatSession = useCase.createChatSession("user-1", "SPOT");
    useCase.acceptChatSession(chatSession.id, "sysop-1");
    handler.enterChatMode(socket, session, chatSession);

    expect(session.inputBuffer).toBe(""); // stale menu text is gone

    // Type "hi" and press Enter through the SAME routing branch a real
    // keystroke uses.
    expect(handleChatModeInput(socket, session, "h")).toBe(true);
    expect(handleChatModeInput(socket, session, "i")).toBe(true);
    expect(handleChatModeInput(socket, session, "\r")).toBe(true);

    const messages = useCase.getChatSession(chatSession.id)!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("hi"); // NOT "REAhi"
    expect(session.inputBuffer).toBe("");
  });

  it("exit leak: F1 mid-line clears the partial chat line so the next command sees an empty buffer", () => {
    const socket = makeSocket();
    const session = makeSession({ user: { id: "user-1", username: "SPOT", secLevel: 10 } as any });

    const chatSession = useCase.createChatSession("user-1", "SPOT");
    useCase.acceptChatSession(chatSession.id, "sysop-1");
    handler.enterChatMode(socket, session, chatSession);

    // Type "hel" but never press Enter — a genuine mid-line state.
    handleChatModeInput(socket, session, "h");
    handleChatModeInput(socket, session, "e");
    handleChatModeInput(socket, session, "l");
    expect(session.inputBuffer).toBe("hel");

    // F1 exits chat mid-line.
    const handled = handleChatModeInput(socket, session, "\x1b[OP");
    expect(handled).toBe(true);

    expect(session.inChat).toBeUndefined();
    expect(session.inputBuffer).toBe(""); // next command starts clean, not "hel..."
  });

  it("backspace trims the buffer one character at a time", () => {
    const socket = makeSocket();
    const session = makeSession({ user: { id: "user-1", username: "SPOT", secLevel: 10 } as any });
    const chatSession = useCase.createChatSession("user-1", "SPOT");
    useCase.acceptChatSession(chatSession.id, "sysop-1");
    handler.enterChatMode(socket, session, chatSession);

    handleChatModeInput(socket, session, "h");
    handleChatModeInput(socket, session, "i");
    handleChatModeInput(socket, session, "\x7f");

    expect(session.inputBuffer).toBe("h");
  });
});
