import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';

/**
 * True when a door is driving this session's screen.
 *
 * A door repaints the whole terminal (blessed doors keep a screen buffer), so
 * anything written as raw ANSI while one is running lands wherever the cursor
 * happens to be and merges into the door's own output.
 *
 * The group chat handlers paint an ANSI chat room - clear screen, header box,
 * message lines - straight at the user. That is right when the BBS itself is
 * running the chat, and wrong when the LiveChat door is: the door draws its
 * own UI on the same terminal, and both ended up on screen at once (reported
 * live 2026-08-25 with a paste showing the two layouts stacked). The room work
 * itself - joining, broadcasting to everyone else, history - still has to
 * happen; only that session's terminal output is suppressed, because the door
 * renders it from its own room events.
 *
 * Any broadcast that reaches every session has to make the same distinction,
 * which is why this lives here rather than inside one handler: the restart
 * notice sends a structured event to door sessions and a banner to the rest.
 *
 * NOT `currentDoorName`. That field is attribution, not liveness - it is set
 * so a door's events carry its registered command (door.handler.ts:1589) and
 * no exit path clears it, so a session that ran FRONTEND once at the login
 * screen counted as door-owned for the rest of its life. Measured 2026-08-26:
 * a plain web connect was classified as a door session after FRONTEND exited,
 * which would have sent every BBS terminal user a structured event they have
 * nothing to render with, instead of the banner. The flags below are the ones
 * the door exit path actually clears (door.handler.ts:2163-2171).
 */
export function doorOwnsTerminal(session: BBSSession): boolean {
  return Boolean(
    (session as any).clientDoorActive
    || (session as any).doorInputHandler
    || (session as any).subState === LoggedOnSubState.DOOR_RUNNING
  );
}
