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

export interface NegotiatedSession extends MutableGeometry {
  terminalType?: string;
}

export interface TerminalTypeReport {
  terminalType: string;
  isC64: boolean;
  width: number;
  height: number;
}

/**
 * A telnet/SSH TTYPE answer landing on a session.
 *
 * EXTRACTED from index.ts's `terminal-type` listener (whole-run review, I13):
 * index.ts boots a server on import, so its listener bodies could only ever be
 * asserted by regex over the file's text - a source pin proves a call exists,
 * not that it works. This is the body; index.ts keeps the logging.
 *
 * Note what it does NOT do: it never stamps `screenWidth = 40` for a C64.
 * applyClientReportedGeometry refuses a PETSCII session's reported geometry,
 * and there is no second write - a C64's width is 40 BY DEFINITION and
 * doorScreenWidth() is where every reader gets it, whatever the field holds.
 *
 * @returns whether the reported geometry was taken.
 */
export function applyTerminalTypeReport(
  session: NegotiatedSession | null | undefined,
  info: TerminalTypeReport,
): boolean {
  if (!session) return false;
  session.terminalType = info.isC64 ? 'c64' : 'modern';
  session.petsciiMode = info.isC64;
  return applyClientReportedGeometry(session, info.width, info.height);
}

export interface WindowSizeOutcome {
  /** The reported size was written onto the session. */
  geometryTaken: boolean;
  /** The terminal type was decided FROM that size (the NAWS fallback). */
  detectedFromSize: boolean;
}

/**
 * A NAWS window-size report landing on a session.
 *
 * EXTRACTED from index.ts's `window-size` listener, same reason as above.
 * A PETSCII session takes neither the geometry nor the fallback detection:
 * once it is a C64 it stays 40x25 and stays a C64.
 */
export function applyWindowSizeReport(
  session: NegotiatedSession | null | undefined,
  width: number,
  height: number,
): WindowSizeOutcome {
  if (!session) return { geometryTaken: false, detectedFromSize: false };
  if (!applyClientReportedGeometry(session, width, height)) {
    return { geometryTaken: false, detectedFromSize: false };
  }
  if (!session.terminalType || session.terminalType === 'unknown') {
    const isC64 = width === C64_COLUMNS && height === 25;
    session.terminalType = isC64 ? 'c64' : 'modern';
    session.petsciiMode = isC64;
    return { geometryTaken: true, detectedFromSize: true };
  }
  return { geometryTaken: true, detectedFromSize: false };
}
