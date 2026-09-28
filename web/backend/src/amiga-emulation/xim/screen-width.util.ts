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

/** A C64 screen is 25 rows, the way it is 40 columns: by definition. */
export const C64_ROWS = 25;

export interface ScreenWidthSource {
  petsciiMode?: boolean;
  /** WEB_: teletext sessions are 40x25 like a C64, but stay ANSI. */
  texttvMode?: boolean;
  screenWidth?: number;
  /**
   * The caller's REAL terminal width, as last negotiated (NAWS / PTY). Unlike
   * `screenWidth`, which the graphics prompt resets to the board's 80-column
   * model, this is left alone by mode changes, so a wire-level consumer (the
   * fold) can tell an 80-column model on a 200-column terminal.
   */
  wireWidth?: number;
  /** 40 (a C64) or 80 (the web terminal's wide PETSCII screen). Absent = 40. */
  petsciiColumns?: number;
}

/** The width of a PETSCII screen: what the caller chose, or the C64's 40. */
export const PETSCII_COLUMN_CHOICES = [C64_COLUMNS, DEFAULT_DOOR_COLUMNS] as const;

/**
 * How wide THIS PETSCII session's screen is.
 *
 * The one place the 40-or-80 question is answered, so a caller cannot be 40
 * to one part of the board and 80 to another. Anything that is not one of
 * the two choices is the C64's 40 - a screen width is chosen at the
 * graphics prompt, never inferred from a browser.
 */
export function petsciiColumnsOf(session: ScreenWidthSource | null | undefined): number {
  return session?.petsciiColumns === DEFAULT_DOOR_COLUMNS ? DEFAULT_DOOR_COLUMNS : C64_COLUMNS;
}

export function doorScreenWidth(
  session: ScreenWidthSource | null | undefined,
  fallback: number = DEFAULT_DOOR_COLUMNS,
): number {
  if (!session) return fallback;
  // Teletext is 40 columns by definition (classic 40x25 grid), like a C64
  // but with no transduction - everything stays ANSI.
  if (session.texttvMode === true) return C64_COLUMNS;
  if (session.petsciiMode !== true) return fallback;
  // A PETSCII screen's width is the MODE's, not the browser's: 40 for a C64,
  // 80 for the web terminal's wide screen, and nothing else. The reported
  // width used to be consulted here, which is how a `P` answer could inherit
  // the xterm's geometry; the mode is chosen at the graphics prompt and the
  // browser has no say in it.
  return petsciiColumnsOf(session);
}

/**
 * The geometry fields a 68K door's session must carry, taken from the
 * caller's.
 *
 * It exists because a 68K door does not read the caller's session - it reads
 * the COPY launchAmigaDoor builds, and a field left out of that copy is a
 * field doorScreenWidth() cannot see. `petsciiMode` was copied and
 * `texttvMode` was not, so a teletext caller's door was told it had eighty
 * columns while `lineWrap` - derived from the real session in the same
 * object literal - said forty. TEXTTV laid out an eighty-column reader on a
 * forty-column screen: every row ran off the right edge and its tail
 * reappeared at column one below (sysop's teletext walk, 2026-09-13).
 *
 * One function, so the copy and the readers cannot drift again: whatever is
 * added to ScreenWidthSource is added here, and the launch site spreads it.
 */
export function doorSessionGeometry(
  session: (ScreenWidthSource & { screenHeight?: number }) | null | undefined,
  terminalWidth: number,
): { lineWrap: number; petsciiMode: boolean; texttvMode: boolean; screenWidth?: number } {
  return {
    lineWrap: doorScreenWidth(session, terminalWidth),
    petsciiMode: session?.petsciiMode === true,
    texttvMode: session?.texttvMode === true,
    screenWidth: session?.screenWidth,
  };
}

export interface ScreenHeightSource extends ScreenWidthSource {
  screenHeight?: number;
}

/**
 * The ONE answer to "how many rows does this caller's screen have?" for 68K
 * doors - the twin of doorScreenWidth() above, and read by BB_SCRHEIGHT
 * (express.e:3867-3868, `msg.data:=screen.height`).
 *
 * It exists because the two halves of a door's geometry came from different
 * places: the width had an authority and the height did not, so BB_SCRHEIGHT
 * answered with the caller's PAUSE COUNT (`pauseLines`, which defaults to 22
 * at XIMProtocol.ts) - a number that has nothing to do with how tall the
 * screen is. A C door that asked for both drew a 40-column layout into a
 * 22-row window on a 25-row C64, leaving the footer floating three rows off
 * the bottom.
 *
 * PETSCII session: 25, always. A C64 has no other height.
 *
 * Any other session: the height the client actually reported
 * (socket-handlers.ts 'terminal-size', or NAWS), when it is a sane one. A
 * session that has reported nothing keeps TODAY'S answer, byte for byte -
 * `fallback` is the caller's existing pauseLines chain, so nothing about an
 * unreporting caller changes.
 */
export function doorScreenHeight(
  session: ScreenHeightSource | null | undefined,
  fallback: number,
): number {
  if (session?.petsciiMode === true) return C64_ROWS;
  // Teletext is 25 rows by definition, same grid as the C64.
  if (session?.texttvMode === true) return C64_ROWS;
  const reported = session?.screenHeight;
  if (typeof reported === 'number' && Number.isInteger(reported) && reported >= 10 && reported <= 200) {
    return reported;
  }
  return fallback;
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
  // The wire width is the terminal's real size and is recorded even for a
  // PETSCII caller's non-40 report, because the fold is a wire concern and a
  // later mode change must not have erased what the terminal said it is.
  session.wireWidth = cols;
  if (session.petsciiMode === true) return false;
  session.screenWidth = cols;
  session.screenHeight = rows;
  return true;
}

export interface NegotiatedSession extends MutableGeometry {
  terminalType?: string;
  unicodeCapable?: boolean;
  isAmigaTerminal?: boolean;
  detectedTerminalType?: string;
}

export interface TerminalTypeReport {
  terminalType: string;
  isC64: boolean;
  /** classifyTerminalType's answers; absent from a report that did not classify. */
  isAmiga?: boolean;
  unicodeCapable?: boolean;
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
  // The terminal's own answers, written HERE and nowhere else. Telnet kept a
  // private listener that was the only writer of `unicodeCapable` on the
  // whole backend, so an SSH caller - whose report came through this
  // function - was never UTF-8: every high-bit character went out as
  // Latin-1 and blessed doors drew the ASCII fallback (web-vs-telnet audit
  // item 1, 2026-09-28).
  if (info.unicodeCapable !== undefined) session.unicodeCapable = info.unicodeCapable;
  if (info.isAmiga !== undefined) session.isAmigaTerminal = info.isAmiga;
  session.detectedTerminalType = info.terminalType;
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
