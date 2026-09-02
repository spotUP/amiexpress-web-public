/**
 * The ONE answer to "how wide is this caller's screen?" for 68K doors.
 *
 * Read by BB_SCRWIDTH (xim/bbs-info.ts handleScreenDimensions - the live
 * dispatch, XIMProtocol.ts:1130 - and the DoorMessageHandler fallback copy)
 * and by the launch-time `lineWrap` in door.handler.ts launchAmigaDoor, so a
 * width-aware door and the wrapLine() safety net can never disagree.
 *
 * PETSCII session: the session's width (40 for every C64; set by
 * terminal-type / NAWS in index.ts), or 40 when the field is missing, zero,
 * or not narrower than 80 (a web 'P' session can still carry the 80 its
 * xterm reported before the caller answered P).
 *
 * Anything else: `fallback` - 80 for BB_SCRWIDTH, which is what every door
 * has been told since day one, byte-for-byte; the resolved terminal width
 * for lineWrap, so wide ANSI terminals keep wrapping where they did.
 */
export const C64_COLUMNS = 40;
export const DEFAULT_DOOR_COLUMNS = 80;

export interface ScreenWidthSource {
  petsciiMode?: boolean;
  screenWidth?: number;
}

export function doorScreenWidth(
  session: ScreenWidthSource | null | undefined,
  fallback: number = DEFAULT_DOOR_COLUMNS,
): number {
  if (!session || session.petsciiMode !== true) return fallback;
  const width = session.screenWidth;
  return typeof width === 'number' && width > 0 && width < DEFAULT_DOOR_COLUMNS ? width : C64_COLUMNS;
}

export interface MutableGeometry extends ScreenWidthSource {
  screenHeight?: number;
}

/**
 * The ONE place a client-reported terminal size is allowed to land on a
 * session.
 *
 * A PETSCII caller's geometry is 40x25 BY DEFINITION, so a size the client
 * reports is ignored for one. Two real reporters exist: the web frontend
 * emits terminal-size {80,25} the moment a door asks for terminal-mode
 * 'fixed' (socket-handlers.ts), and a C64 telnet client can announce
 * 80 columns over NAWS (index.ts). Either one landing put the two halves of
 * the 40-column story in permanent disagreement - wrapForSession saw
 * `width >= 80` and went identity while doorScreenWidth() still answered 40,
 * so prose ran off the right edge of a screen the door was painting at 40.
 *
 * Non-PETSCII sessions are untouched: the reported size is written exactly
 * as before, so 80-column output for every ANSI caller is byte-for-byte
 * unchanged.
 *
 * @returns true when the size was taken (callers may then tell a running
 *          door about the resize), false when the session keeps its own
 *          geometry.
 */
export function applyClientReportedGeometry(
  session: MutableGeometry | null | undefined,
  cols: number,
  rows: number,
): boolean {
  if (!session) return false;
  if (session.petsciiMode === true) return false;
  session.screenWidth = cols;
  session.screenHeight = rows;
  return true;
}
