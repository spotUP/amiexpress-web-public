/**
 * Keeping mouse motion from drowning the door bridge.
 *
 * Every input event from a browser is forwarded to the door process and
 * logged on the way. Mouse MOTION arrives as a continuous stream - moving
 * the pointer across the chat window produces hundreds of events a second,
 * each one parsed, stringified into the log, sent over the bridge and
 * answered with a re-render.
 *
 * On 2026-08-26 that was enough to block the event loop on the live server:
 * the container stayed up, /health stopped answering even from inside it,
 * and the site was down for everyone while one person moved a mouse over
 * /chat. The only guard was a comment saying motion "may be throttled by
 * frontend" - which is to say the server trusted the client not to hurt it.
 *
 * Motion is throttled here; everything else passes untouched. A click or a
 * keystroke delayed by even a frame is noticeable, and neither arrives in
 * floods.
 */

/**
 * Fastest motion updates a door needs.
 *
 * Hover highlighting and drag feedback are the reasons motion is forwarded
 * at all, and both look smooth at this rate. It is a floor on the interval,
 * not a sample rate: a single move still arrives immediately.
 */
export const MOTION_INTERVAL_MS = 40;

/**
 * Whether an input string is a mouse MOTION report.
 *
 * SGR mouse reports look like `ESC [ < button ; x ; y M|m`, and bit 5 (32)
 * of the button field marks motion. X10-style reports (`ESC [ M` plus three
 * bytes) encode the same bit in the first byte.
 */
export function isMouseMotion(data: string): boolean {
  if (typeof data !== 'string' || data.length < 3) return false;

  // SGR: ESC [ < b ; x ; y (M or m)
  const sgr = /^\x1b\[<(\d+);\d+;\d+[Mm]$/.exec(data);
  if (sgr) {
    return (Number.parseInt(sgr[1], 10) & 32) !== 0;
  }

  // X10: ESC [ M then button+32, x+32, y+32
  if (data.startsWith('\x1b[M') && data.length >= 6) {
    return ((data.charCodeAt(3) - 32) & 32) !== 0;
  }

  return false;
}

/** State for one session's motion throttle. */
export interface MotionThrottle {
  lastMotionAt: number;
}

export function newMotionThrottle(): MotionThrottle {
  return { lastMotionAt: 0 };
}

/**
 * Whether this input should reach the door.
 *
 * Non-motion input always passes. Motion passes when enough time has gone
 * by since the last one that did - so a pointer crossing the screen updates
 * hover smoothly without sending every intermediate pixel.
 */
export function shouldForwardInput(
  state: MotionThrottle,
  data: string,
  now: number,
  intervalMs: number = MOTION_INTERVAL_MS
): boolean {
  if (!isMouseMotion(data)) return true;
  if (now - state.lastMotionAt < intervalMs) return false;

  state.lastMotionAt = now;
  return true;
}
