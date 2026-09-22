/**
 * WHERE THE DASHBOARD'S THREE PANELS GO.
 *
 * The door already knew how to stack them - its resize handler has done so
 * at the `small` breakpoint since it was written - but the panels were BUILT
 * at `width: '50%'` and the handler only ever ran on a RESIZE. A C64 caller
 * opens the door at forty columns and never resizes anything, so he got the
 * eighty-column layout: two twenty-column panels side by side, each eighteen
 * wide inside its border, holding lines like `Memory  68% [====    ]`.
 *
 * The placement is a function of the width now, and both the first build and
 * the resize read it - which is the whole point, since the two disagreeing
 * is what the caller was looking at.
 *
 * The sysop, 2026-09-22: "some of our typescript doors dont have a 40 column
 * mode". This one had half of one.
 */
import { isCompactWidth } from '@amiexpress/bbs-door-sdk';

export interface PanelPlacement {
  left: number | string;
  top: number | string;
  width: string;
  /** Rows at the compact tier, a percentage on a wide board. */
  height?: string | number;
  bottom?: number;
}

/** Border, CPU, Memory, Disk, border. */
const SYSTEM_ROWS = 5;
/** Border, two statistics, border. */
const STATS_ROWS = 4;

export interface DashboardPanels {
  system: PanelPlacement;
  stats: PanelPlacement;
  nodes: PanelPlacement;
  /** True when the three are stacked down the screen. */
  stacked: boolean;
}

/**
 * The three panels at a caller's width.
 *
 * Stacked, each panel is a third of the screen: the node list keeps the
 * bottom anchor it has always had, so the status row is never painted over
 * whichever layout is up.
 */
export function dashboardPanels(width: number): DashboardPanels {
  if (isCompactWidth(width)) {
    /*
     * SIZED TO WHAT THEY HOLD, not to a third of the screen each.
     *
     * A third of twenty-five rows is eight, and the system panel has three
     * lines in it - CPU, Memory, Disk - so the caller was given a nearly
     * empty box, then another, and a node list squeezed under them (the
     * sysop, 2026-09-22: "the dashboard petscii layout needs a lot of
     * work"). Five rows hold the three gauges and their border; four hold
     * the two statistics and theirs; the node list takes everything left,
     * which is the panel that grows with the board.
     */
    return {
      system: { left: 0, top: 1, width: '100%', height: SYSTEM_ROWS },
      stats: { left: 0, top: 1 + SYSTEM_ROWS, width: '100%', height: STATS_ROWS },
      nodes: { left: 0, top: 1 + SYSTEM_ROWS + STATS_ROWS, width: '100%', bottom: 1 },
      stacked: true,
    };
  }
  return {
    system: { left: 0, top: 1, width: '50%', height: '50%' },
    stats: { left: '50%', top: 1, width: '50%', height: '50%' },
    nodes: { left: 0, top: '50%+1', width: '100%', bottom: 1 },
    stacked: false,
  };
}

/**
 * How wide a rule drawn inside a panel may be.
 *
 * The node list drew `'─'.repeat(60)` - sixty columns, on a panel that is
 * forty at most on a C64 and whatever the caller's terminal is when he
 * widens it. The rule is the panel's own interior now, less its border and
 * the column the text box is inset by.
 */
export function panelRuleWidth(width: number): number {
  return Math.max(4, Math.min(60, width - 4));
}

/**
 * How wide the gauge beside a percentage may be.
 *
 * `CPU Usage:  100%  [====================]` is forty columns before the
 * panel's border is paid for, so on a C64 the closing bracket - and two of
 * the bars - were off the glass. The label and the percentage are sixteen
 * columns; the gauge is whatever the panel has after them, brackets
 * included, and never more than the twenty it draws at eighty columns.
 */
export function gaugeWidth(width: number): number {
  // EIGHTY COLUMNS ARE UNCHANGED, twenty as they have always been - the
  // eighty-column screen is frozen and this door's half-width panel has
  // always clipped the last bars against its border. Only the compact tier
  // is drawn afresh, where the whole row is off the glass rather than four
  // columns of one gauge.
  if (!isCompactWidth(width)) return 20;
  /*
   * The row is `CPU Usage:  100%  ` - seventeen columns - and then the bar,
   * which `makeProgressBar` draws with a BRACKET AT EACH END on top of the
   * width it is given. Nineteen columns of the panel's interior are spoken
   * for before a single bar is drawn; a first cut subtracted eighteen and
   * the closing bracket wrapped onto a row of its own.
   */
  const interior = Math.max(8, width - 4);
  return Math.max(4, Math.min(20, interior - 19));
}

/** The node list's columns: handle, status, and whether there is room for a location. */
export interface NodeColumns {
  handle: number;
  status: number;
  showLocation: boolean;
}

/**
 * The node row at a caller's width.
 *
 * At eighty it is `id, handle(16), status(10), location` - fifty columns of
 * a full-width panel. At forty the panel's interior is thirty-six and the
 * location goes: a node's number, who is on it and what they are doing is
 * what the row is READ for, and squeezing four fields into thirty-six means
 * none of them is legible.
 */
export function nodeColumns(width: number): NodeColumns {
  if (isCompactWidth(width)) return { handle: 14, status: 9, showLocation: false };
  return { handle: 16, status: 10, showLocation: true };
}
