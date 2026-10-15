/**
 * Regression: inline ~CC_ door in a conference-join screen rendered the
 * menu prompt mid-join ("double prompt", 2026-08-14). executeAmigaDoor's
 * exit path must not touch the menu while screen segments remain — the
 * display flow (e.g. "Joining Conference:") continues and renders the
 * prompt itself once done.
 */
import "reflect-metadata";

// door.handler imports BBSState from src/index — mock it so importing the
// handler doesn't boot the whole server (same pattern as commandHandlers.test.ts).
jest.mock("../src/index", () => ({
  BBSState: { LOGGEDON: "loggedon", AWAIT: "await" },
  LoggedOnSubState: {},
}));

import { postDoorMenuAction } from "../src/handlers/door.handler";
import { LoggedOnSubState } from "../src/constants/bbs-states";

type AnySession = Parameters<typeof postDoorMenuAction>[0];

function session(overrides: Record<string, unknown> = {}): AnySession {
  return { subState: LoggedOnSubState.DOOR_RUNNING, ...overrides } as AnySession;
}

describe("postDoorMenuAction", () => {
  it("does not render the menu while conference-join screen segments remain", () => {
    const s = session({ screenSegments: { segments: ["~CC_CONFTOP leftover", "join tail"] } });
    expect(postDoorMenuAction(s)).toBe("segments");
  });

  it("segments guard beats the pause guard (segment check takes priority)", () => {
    const s = session({
      screenSegments: { segments: ["tail"] },
      paginatedScreen: {},
    });
    expect(postDoorMenuAction(s)).toBe("segments");
  });

  it("door in the LAST segment (already shifted, length 0) still counts as segment processing", () => {
    // ~CC_CONFTOP lives in the final join-screen segment: by the time the
    // door runs, that segment was shift()ed so the list is empty, but
    // session.screenSegments is only cleared after the parse returns.
    const s = session({ screenSegments: { segments: [] } });
    expect(postDoorMenuAction(s)).toBe("segments");
  });

  it("cleared screenSegments (undefined) falls through to normal menu return", () => {
    const s = session({ screenSegments: undefined });
    expect(postDoorMenuAction(s)).toBe("menu");
  });

  it("active pause skips the menu (display flow resumes it)", () => {
    expect(postDoorMenuAction(session({ paginatedScreen: {} }))).toBe("pause");
  });

  it("RETURNCOMMAND interactive prompt states keep ownership of input", () => {
    for (const sub of [
      LoggedOnSubState.FILES_UPLOAD,
      LoggedOnSubState.FILES_DOWNLOAD,
      LoggedOnSubState.UPLOAD_RESUME_PROMPT,
      LoggedOnSubState.UPLOAD_RESUME_DELETE,
      LoggedOnSubState.UPLOAD_RENAME_PROMPT,
      LoggedOnSubState.DOWNLOAD_FILENAME_INPUT,
      LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT,
    ]) {
      expect(postDoorMenuAction(session({ subState: sub }))).toBe("interactive");
    }
  });

  it("plain door completion returns to the menu", () => {
    expect(postDoorMenuAction(session())).toBe("menu");
  });

  // Important 4 (DD final-review wave, 2026-08-16): when the sysop accepts
  // a page during the post-door page-wait, chat.handler.ts's
  // enterChatMode() sets session.inChat = true and the chat UI now owns
  // the screen. postDoorMenuAction must report 'chat' so the caller skips
  // the menu repaint — see apply-post-door-menu-action.test.ts for the
  // behavioral assertion that no repaint actually happens.
  it("inChat takes priority over the default 'menu' return", () => {
    const s = session({ inChat: true });
    expect(postDoorMenuAction(s)).toBe("chat");
  });

  it("inChat wins even when segments/pause/interactive flags are also set (defensive — chat UI must never be clobbered by a stale flag)", () => {
    const s = session({
      inChat: true,
      screenSegments: { segments: ["tail"] },
      paginatedScreen: {},
      subState: LoggedOnSubState.FILES_UPLOAD,
    });
    expect(postDoorMenuAction(s)).toBe("chat");
  });
});
