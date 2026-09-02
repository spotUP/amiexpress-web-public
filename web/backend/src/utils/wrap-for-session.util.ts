/**
 * Session-width word wrap (pulled into the petscii-full-canvas plan as
 * Task 10 from the C64/40-col plan's Task 4).
 *
 * The one choke point for prose reflow. Guards keep it provably inert
 * where it must be:
 *  - width >= 80: IDENTITY (80-col output byte-for-byte unchanged).
 *  - door-owned session: IDENTITY (doors paint their own screens).
 *  - payload with cursor motion/positioning/clear: IDENTITY (positioned
 *    UI and ANSI art are never rewrapped - "never squeeze art").
 *
 * printableLength/wrapLineToWidth are pure and live in the SDK
 * (sdk/petscii/wrap.ts) so the C64 Door Adapter plan can reuse them without
 * pulling in web/backend. Only the session-aware guards live here.
 */
import { printableLength, wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';
import { doorOwnsTerminal } from './door-owns-terminal';

export { printableLength, wrapLineToWidth };

/** Motion, absolute positioning, clears, save/restore: art or full-screen UI. */
const CURSOR_CONTROL_RE = /\x1b\[[0-9;]*[ABCDHJKsu]/;

/** Width the session was told it has; 80 when unknown. The 40-col plan's Task 1 replaces this with sessionColumns(). */
function sessionWidth(session: { screenWidth?: number }): number {
  return session.screenWidth && session.screenWidth > 0 ? session.screenWidth : 80;
}

export function wrapForSession(
  text: string,
  session: { screenWidth?: number; petsciiMode?: boolean } | undefined
): string {
  if (!session) return text;
  const width = sessionWidth(session);
  if (width >= 80) return text;                       // 80-col: byte-identical
  if (doorOwnsTerminal(session as any)) return text;  // door paints the screen
  if (CURSOR_CONTROL_RE.test(text)) return text;      // positioned UI / art
  return text
    .split(/\r\n|\n/)
    .map((l) => wrapLineToWidth(l, width).join('\r\n'))
    .join('\r\n');
}
