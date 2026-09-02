/**
 * AmiStripper's line widths, in one place.
 *
 * The door drew a header padded to 80, a rule of 80 dashes and rows with a
 * 38- or 40-character path column - none of which a 40-column C64 caller
 * can hold. Every rule here takes the LIVE terminal width and asks the
 * SDK's single compact profile what to do with it; at 80 every one of them
 * returns exactly the string the door emitted before.
 *
 * Its own module so the rules are testable without the door runtime.
 */
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';

/**
 * One payload, word-wrapped to the caller's width.
 *
 * This door writes through BBSApi.write(), which emits straight to the socket
 * and never passes the backend's wrapForSession - so a status line carrying a
 * filename ("Stripped archive written to <name> (portable ZIP format).", 66
 * columns) does not soft-wrap on a C64, it hard-wraps mid-word and eats the
 * row beneath. The wrap is the SDK's `wrapLineToWidth`, the same primitive
 * wrapForSession is built on, so the door and the board break lines the same
 * way.
 *
 * At 80 columns and wider this is a straight pass-through: the board's bytes
 * are exactly what they were.
 */
export function fitToWidth(text: string, width: number): string {
  if (width >= 80) return text;
  // Line breaks are put back exactly as they were - a prompt ends without
  // one, and adding one would move the cursor off the input row.
  return text
    .split('\r\n')
    .map(part => (part.length === 0 ? part : wrapLineToWidth(part, width).join('\r\n')))
    .join('\r\n');
}

/** The banner: title on the left, the pattern count on the right. */
export function stripperHeader(patternCount: string, width: number): string {
  const compact = getCompactProfile(width);
  const left = compact.collapseChrome ? ' ARCHIVE STRIPPER' : ' AMIGA ARCHIVE STRIPPER';
  const right = compact.collapseChrome ? `[db ${patternCount}]` : `[scene db: ${patternCount} patterns]`;
  const pad = width - left.length - right.length;
  return left + ' '.repeat(Math.max(0, pad)) + right;
}

/** The rule under the listing, as wide as the screen and no wider. */
export function stripperRule(width: number): string {
  return '─'.repeat(Math.max(1, width));
}

/**
 * How many characters the path column may use.
 * Wide keeps the literals the door has always used (38 stripped, 40 kept);
 * narrow leaves room for the two-space indent, the size and a gap.
 */
export function pathColumn(wide: number, width: number): number {
  return getCompactProfile(width).singleColumn ? Math.max(8, width - 12) : wide;
}

/** True when the `[reason]` tail has nowhere to go. */
export function showsReason(width: number): boolean {
  return !getCompactProfile(width).singleColumn;
}
