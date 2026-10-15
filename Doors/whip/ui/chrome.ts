/**
 * WHIP's chrome, in one place.
 *
 * Every screen in this door builds the same two boxes - a framed header
 * three rows tall and a framed footer three rows tall - and each one filled
 * them with its own centred title and its own hand-typed `[Enter] Select`
 * line. That is seven copies of a look and seven places for it to drift; it
 * is also why WHIP had the theme's COLOURS and none of its chrome, which is
 * the complaint `attachDoorChrome` exists to answer.
 *
 * So this is the door's ONE call into it. A view hands over the boxes it
 * already made and gets back the animated slash rail, the theme's glitches
 * and the SDK's hint row - without a cell of its layout moving, because the
 * geometry stays where the view put it and only the CONTENT of those two
 * rows changes.
 *
 * A three-row box with a line border has exactly one interior row (probed:
 * `iheight` 1, `iwidth` 78 at 80 columns), so the rail lands on the row the
 * centred title used to occupy and the hint line on the row the hand-typed
 * keys used to occupy. Neither box grows.
 */
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  attachDoorChrome,
  type DoorChrome,
  type FooterHint,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { T, S, CURRENT } from '../door-theme';

export type { DoorChrome, FooterHint };

export interface WhipChromeOptions {
  /** The view's screen. Its LIVE width decides every tier below. */
  screen: Screen;
  /** The view's framed header box. The rail draws into its one interior row. */
  header?: unknown;
  /** The view's framed footer box. The hint line draws into its interior row. */
  footer?: unknown;
  /** The headline, right of the rail. */
  title: string;
  /** The keys this view answers to, at 50 columns and wider. */
  hints: readonly FooterHint[];
  /** The same keys, shortened, for the 40-column C64 tier. */
  compactHints?: readonly FooterHint[];
  /**
   * The element the theme's glitches damage - always the view's LIST or its
   * scrolling pane, never the header or the hint row: damage on those two
   * reads as the door being broken rather than as atmosphere.
   *
   * Pass a FUNCTION when the view rebuilds that element, so the tick finds
   * the pane that is actually on screen rather than a detached one.
   */
  glitch?: unknown | (() => unknown);
}

/**
 * Attach the full chrome to one WHIP view.
 *
 * The returned handle MUST be stopped from that view's teardown - a rail
 * timer still writing after `screen.remove()` takes the session with it.
 */
export function attachWhipChrome(options: WhipChromeOptions): DoorChrome {
  const { screen, header, footer, title, hints, compactHints, glitch } = options;

  // The live width, never 80: the rail is drawn to the screen the caller
  // actually has, and `attachDoorChrome` is the one thing that decides from
  // it whether anything moves at all.
  const width = ((screen as { width?: number }).width) || 80;

  const masthead = header
    ? createBox({
        parent: header as never,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        // Explicitly none: Panel takes a line border when the caller names
        // no `border` key at all, and a one-row framed box has no interior.
        border: undefined,
        // The header's own colours rather than the SDK's bar style: this row
        // sits INSIDE a framed panel, and a bar-coloured strip in there
        // reads as a band painted across the box, not as its title.
        style: { fg: T.ink, bg: T.ground },
        content: '',
        focusable: false,
        mouse: false,
        clickable: false,
      })
    : undefined;

  return attachDoorChrome(CURRENT, {
    width,
    title,
    masthead: masthead as never,
    // One column short of the screen - writing a row's final cell leaves the
    // terminal in a pending-wrap state - and two more for the header's frame.
    mastheadWidth: Math.max(1, width - 3),
    footer: footer as never,
    hints,
    compactHints,
    // Every footer in this door indented its keys by one column; keeping the
    // pad means the hint row starts exactly where the old line started.
    footerPad: ' ',
    // `unknown` at this door's boundary, a GlitchSource at the SDK's: the
    // door takes any element or getter and the SDK decides what it can
    // damage. Cast at the seam rather than widening either side.
    glitch: glitch as never,
    glitchOptions: { tickMs: 400 },
    styles: S,
    render: () => screen.render(),
  });
}
