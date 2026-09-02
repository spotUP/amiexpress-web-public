/**
 * Session-width word wrap (pulled into the petscii-full-canvas plan as
 * Task 10 from the C64/40-col plan's Task 4).
 *
 * The one choke point for prose reflow. Guards keep it provably inert
 * where it must be:
 *  - non-PETSCII session: IDENTITY. `session.petsciiMode === true` is the
 *    single source of truth for "is this a C64 caller" - the same gate
 *    `doorScreenWidth()` (web/backend/src/amiga-emulation/xim/screen-width.util.ts)
 *    uses for door width. That file was landing concurrently with this one
 *    and isn't committed yet, so the gate is inlined here rather than
 *    imported; once it lands this should call it instead of duplicating
 *    the check. Gating on `screenWidth` alone was wrong: socket-handlers.ts
 *    sets `session.screenWidth` from real xterm dimensions for EVERY web
 *    socket, C64 or not, so an ordinary user with a narrow browser window
 *    or on mobile would have gotten help/mail/bulletins word-wrapped -
 *    non-C64 platforms never pay for C64 support.
 *  - width >= 80: IDENTITY (80-col output byte-for-byte unchanged).
 *  - door-owned session: IDENTITY (doors paint their own screens).
 *  - payload with cursor motion/positioning/clear/save-restore: IDENTITY
 *    (positioned UI and ANSI art are never rewrapped - "never squeeze
 *    art"). Detected by `positionsCursorAbsolutely`
 *    (web/backend/src/utils/ascii-art.util.ts) - the same detector
 *    xim/io.ts's line-wrap safety net uses, so there is one definition of
 *    "this line paints a screen," not a second regex that can drift from
 *    it (it did: the previous local regex missed G/d/E/F, which the
 *    blessed engine emits).
 *
 * printableLength/wrapLineToWidth are pure and live in the SDK
 * (sdk/petscii/wrap.ts) so the C64 Door Adapter plan can reuse them without
 * pulling in web/backend. Only the session-aware guards live here.
 */
import { printableLength, wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';
import { doorOwnsTerminal } from './door-owns-terminal';
import { positionsCursorAbsolutely } from './ascii-art.util';

export { printableLength, wrapLineToWidth };

/** Width the session was told it has; 80 when unknown. The 40-col plan's Task 1 replaces this with sessionColumns(). */
function sessionWidth(session: { screenWidth?: number }): number {
  return session.screenWidth && session.screenWidth > 0 ? session.screenWidth : 80;
}

export function wrapForSession(
  text: string,
  session: { screenWidth?: number; petsciiMode?: boolean } | undefined
): string {
  if (!session) return text;
  if (session.petsciiMode !== true) return text;      // non-C64: never wrapped, at any width
  const width = sessionWidth(session);
  if (width >= 80) return text;                       // 80-col: byte-identical
  if (doorOwnsTerminal(session as any)) return text;  // door paints the screen
  if (positionsCursorAbsolutely(text)) return text;   // positioned UI / art / clears / save-restore
  return text
    .split(/\r\n|\n/)
    .map((l) => wrapLineToWidth(l, width).join('\r\n'))
    .join('\r\n');
}
