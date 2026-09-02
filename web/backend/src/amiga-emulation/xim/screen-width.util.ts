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
