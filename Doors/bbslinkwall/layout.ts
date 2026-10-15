/**
 * WHAT THIS DOOR CAN PROMISE A C64, AND WHAT IT CANNOT.
 *
 * The wall is fetched from bbslink.net and drawn there for eighty columns.
 * This door does not lay it out and cannot: the bytes are somebody else's
 * screen. What it CAN do is stop adding its own eighty-column furniture on
 * top - the banner was a fifty-column rule on a forty-column screen - and
 * tell the caller once, before the wall arrives, that what follows is drawn
 * for a wider terminal.
 *
 * That is the honest version of "adapt it": the door's own chrome fits, and
 * the part that is not ours is announced rather than promised.
 */
import { isCompactWidth } from '@amiexpress/bbs-door-sdk';

/** The caller's columns, from the one width source a door can read. */
export function screenColumns(ctx: { bbsSession?: { screenWidth?: number } }): number {
  const width = Number(ctx.bbsSession?.screenWidth ?? 80);
  return Number.isFinite(width) && width > 0 ? width : 80;
}

/** The door's own banner, as wide as the caller's screen and no wider. */
export function banner(title: string, width: number): string[] {
  const inner = Math.max(10, Math.min(48, width - 2));
  const rule = `\x1b[36m+${'='.repeat(inner)}+\x1b[0m`;
  const pad = Math.max(0, inner - title.length);
  const left = Math.floor(pad / 2);
  return [
    rule,
    `\x1b[36m|\x1b[0m${' '.repeat(left)}\x1b[32m${title.slice(0, inner)}\x1b[0m${' '.repeat(pad - left)}\x1b[36m|\x1b[0m`,
    rule,
  ];
}

/**
 * The one line a forty-column caller is owed before somebody else's
 * eighty-column screen arrives.
 */
export function widthNotice(width: number): string | null {
  if (!isCompactWidth(width)) return null;
  // Thirty-six columns: it has to fit the screen it is warning about.
  return '\x1b[33mThe wall is 80 columns - it wraps.\x1b[0m';
}
