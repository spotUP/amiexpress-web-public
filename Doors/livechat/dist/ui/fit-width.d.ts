/**
 * An overlay's width, on the screen the caller actually has.
 *
 * LiveChat's dialogs are centred boxes with a written-down width - 48 for
 * the profile card, 50 for the message and prompt boxes, 45 for the
 * question. Every one of those numbers is an eighty-column screen spelled
 * out, and on a C64 the box hangs off both edges: measured at 40x25 on
 * 2026-09-22, the profile overlay ran from column -4 to column 44.
 *
 * There is nothing for an overlay to yield to - it has no neighbour - so
 * the rule is simply the screen: keep the width the door asked for while it
 * fits, and take what there is when it does not. At eighty and above this
 * returns the same number the door wrote down, so the board's own screen is
 * untouched.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function fitWidth(screen: Screen | undefined, preferred: number): number;
