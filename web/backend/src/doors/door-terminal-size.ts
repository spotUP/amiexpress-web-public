/**
 * The size a door may draw on - the answer behind BBSApi.getTerminalSize().
 *
 * R1: every door starts 80x25. The caller's real size is handed out only
 * while the terminal is wide - the call's Alt+Enter choice, or a door that
 * forced wide through enableWideMode. The session keeps the real size either
 * way (screenWidth/screenHeight), so toggling needs no new report.
 */
import type { BBSSession } from '../index';
import { doorScreenHeight, doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';

/** Whether the door should see the caller's full terminal: the call's choice, or a door that forced wide. */
export function isTerminalWide(session: BBSSession | null | undefined): boolean {
  return session?.terminalWideChoice === true || session?.doorTerminalWide === true;
}

export function doorTerminalSize(session: BBSSession | null | undefined): { width: number; height: number } {
  const wide = isTerminalWide(session);
  const reported = wide ? session?.screenWidth : 80;
  // FLOORED AT 80 for every non-PETSCII caller, the same rule
  // sessionColumns() applies at the door gate: `max(80, reported)`, never
  // narrower. createScreen() turns a width under 41 into the XXS
  // single-column profile (blessed-helpers.ts responsive/isCompactWidth),
  // so handing it a phone's raw 40 gave an ANSI caller the C64 layout - an
  // 80-column regression on a live path (socket-handlers.ts writes the
  // reported cols unfiltered for every web socket). One width authority,
  // not two.
  const floored = Math.max(80, reported && reported > 0 ? reported : 80);
  return {
    width: doorScreenWidth(session, floored),
    // Same rule for the other axis, through the SAME authority the 68K
    // side reads (doorScreenHeight): a PETSCII text screen is 25 rows BY
    // DEFINITION at both widths, so a stale 24 reported by a browser
    // terminal before the caller answered `P` must not shrink a PETSCII
    // door's canvas. Two answers to one question is how the width came to
    // disagree with itself before it had an authority.
    height: wide
      ? doorScreenHeight(session, session?.screenHeight || 25)
      // Fixed mode is 25 rows whatever the caller reports; only the PETSCII
      // and teletext row counts still win (doorScreenHeight reads them first).
      : doorScreenHeight({ petsciiMode: session?.petsciiMode, texttvMode: session?.texttvMode }, 25),
  };
}
