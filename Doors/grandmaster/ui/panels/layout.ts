/**
 * Where the board and the HUD go, at whatever width the caller has.
 *
 * Exported and I/O-free on purpose, the shape Doors/bug-tracker/layout.ts and
 * Doors/ami-stripper/layout.ts take: every width rule lives in one testable
 * function rather than scattered through a screen that needs a terminal to run.
 *
 * THE BOARD IS THE SAME SIZE ON EVERY SCREEN. Six panels at two characters is
 * twelve columns, and twelve rows plus the incoming one is thirteen - which
 * fits inside forty columns and twenty-five rows with room left over. So unlike
 * every other door adapted for the C64, nothing here has to be folded, stacked
 * or dropped. What changes is the CHROME around it: at forty columns the HUD
 * loses its labels and sits in whatever space is left.
 *
 * Read the tier, never compare widths by hand - the SDK owns the breakpoints
 * and a second ladder here would eventually disagree with it.
 */

import {
  getBreakpointName,
  getCompactProfile,
  isCompactWidth,
  effectsAllowed,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/** Characters the HUD needs when it can spell things out. */
const HUD_WIDE = 16;
/** Characters the HUD needs when it cannot. */
const HUD_COMPACT = 12;
/** Space between the board and the HUD. */
const GAP = 2;

/**
 * How many characters one panel takes, and how many rows.
 *
 * A panel is 2x1 characters at its smallest, which reads square on a terminal
 * whose cells are about twice as tall as they are wide. That is the whole
 * board on an 80x25 screen and it leaves most of a phone empty: the playfield
 * is twelve columns of a forty-column screen, and the rest is black.
 *
 * So the tile GROWS to fit. The rule is the largest whole multiple that still
 * leaves room for the board and its HUD, which is a different answer on every
 * screen and the reason this is computed rather than written down:
 *
 *   80x25 terminal   1x  - the classic board, unchanged
 *   40x25 C64        3x1 - fills the width; a C64 cell is square, so the tile
 *                          stays 2:1 there, which is the trade the sysop chose
 *   phone, 40x50     3x2 - a small font gives rows to spend, so the tile grows
 *                          both ways and the board fills the screen
 */
export interface PanelScale {
  /** Characters per panel, horizontally. Always even: a panel is 2 wide. */
  x: number;
  /** Rows per panel. */
  y: number;
}

/** Rows the stacked HUD needs under the board, plus the frame around it. */
const STACKED_HUD_ROWS = 2;
const FRAME_ROWS = 2;
const FRAME_COLS = 2;

/**
 * The biggest tile this screen can hold.
 *
 * Never smaller than 1x, because the 2x1 panel is the floor the sprites are
 * drawn at; and capped, because a board that fills a 200-column terminal in
 * six enormous tiles is not more readable, it is just bigger.
 */
export function panelScale(
  screenWidth: number,
  screenHeight: number,
  boardCols: number,
  boardRows: number,
  stacked: boolean,
): PanelScale {
  // Beside the board, the HUD's columns are not the board's to grow into.
  const usableCols = Math.max(
    1,
    stacked ? screenWidth - FRAME_COLS : screenWidth - FRAME_COLS - GAP - HUD_WIDE,
  );
  const usableRows = Math.max(
    1,
    screenHeight - FRAME_ROWS - (stacked ? STACKED_HUD_ROWS : 0),
  );

  const fitX = Math.max(1, Math.min(MAX_SCALE, Math.floor(usableCols / boardCols)));
  const fitY = Math.max(1, Math.min(MAX_SCALE, Math.floor(usableRows / boardRows)));

  // A TILE KEEPS ITS SHAPE unless the board owns the whole width.
  //
  // Growing width and height independently is how an 80x25 terminal ended up
  // with 4x1 tiles - eight characters wide and one row tall, which is not a
  // panel, it is a dash. Where the HUD sits beside the board there is height
  // to spare and width to spare in different amounts, so the scale is the
  // smaller of the two and the tile stays the shape it was drawn.
  if (!stacked) {
    const uniform = Math.min(fitX, fitY);
    return { x: uniform, y: uniform };
  }

  // Stacked, the board is the screen and filling the width is the point - a
  // C64 has 25 rows, so height caps at 1x while width has room for three, and
  // a wide tile that fills the screen was the trade chosen over a square tile
  // in a corner of it. Still bounded, so the stretch stays legible.
  return { x: Math.min(fitX, fitY + MAX_STRETCH), y: fitY };
}

/** How much wider than tall a tile may be stretched when it owns the width. */
const MAX_STRETCH = 2;

/** Beyond this a bigger tile stops helping and starts wasting the screen. */
const MAX_SCALE = 4;

export interface PanelsLayout {
  /** True at 40 columns: no labels, no chrome, no effects. */
  compact: boolean;
  /** May decorative chrome animate? Never at 40 columns. */
  effects: boolean;
  /** The width tier, for anything that wants to branch further. */
  tier: string;
  board: { top: number; left: number; width: number; height: number };
  hud: { top: number; left: number; width: number; height: number };
  /** Draw a border around the board? Not when there is no room for one. */
  border: boolean;
  /** Characters and rows per panel; the renderer scales the board by this. */
  scale: PanelScale;
  /** Is the HUD under the board rather than beside it? */
  stacked: boolean;
}

/**
 * Place a board of `boardCols` x `boardRows` characters on a screen.
 *
 * At 80 columns and wider the pair is centred, biased left so the HUD beside it
 * does not push the board off-centre visually. At 40 the board goes hard left
 * with a single column of margin, because centring a 12-wide board on a 40-wide
 * screen wastes the space the HUD needs.
 */
export function panelsLayout(
  screenWidth: number,
  screenHeight: number,
  boardCols: number,
  boardRows: number,
): PanelsLayout {
  const compact = isCompactWidth(screenWidth);
  const profile = getCompactProfile(screenWidth);

  // THE HUD GOES UNDER THE BOARD when there is not room for it beside one.
  //
  // Side by side, the HUD costs the board sixteen columns it could have grown
  // into - which on a phone is most of the screen ("the playfield should use
  // the full phone width"). Stacked, the board takes the width and the HUD
  // takes two rows under it, which is the single-column rule the compact
  // profile already asks for everywhere else on this board.
  // PORTRAIT STACKS, LANDSCAPE SITS BESIDE.
  //
  // Not width alone: an 80x25 terminal is narrow in characters but wide on the
  // glass, and stacking there would replace the classic board with a squat one
  // nobody asked for. A screen with more ROWS than columns is a phone held
  // upright, and that is exactly the case where the HUD beside the board costs
  // it most of the width it could be using.
  const portrait = screenHeight > screenWidth;
  const stacked = compact || portrait || screenWidth < boardCols + GAP + HUD_WIDE + 2;
  const hudWidth = stacked ? screenWidth - FRAME_COLS : HUD_WIDE;

  const scale = panelScale(screenWidth, screenHeight, boardCols, boardRows, stacked);
  const width = boardCols * scale.x;
  const height = boardRows * scale.y;

  const totalWidth = stacked ? width : width + GAP + hudWidth;
  const left = Math.max(1, Math.floor((screenWidth - totalWidth) / 2));
  const top = stacked
    ? Math.max(1, Math.floor((screenHeight - height - STACKED_HUD_ROWS) / 2))
    : Math.max(1, Math.floor((screenHeight - height) / 2));

  return {
    compact,
    effects: effectsAllowed(screenWidth),
    tier: getBreakpointName(screenWidth),
    board: { top, left, width, height },
    hud: stacked
      ? {
        top: top + height,
        left,
        width: Math.max(0, Math.min(hudWidth, screenWidth - left)),
        height: STACKED_HUD_ROWS,
      }
      : {
        top,
        left: left + width + GAP,
        width: Math.max(0, Math.min(hudWidth, screenWidth - (left + width + GAP))),
        height,
      },
    // getCompactProfile says whether this tier draws frames at all.
    border: profile.borders,
    scale,
    stacked,
  };
}

/**
 * The HUD's lines.
 *
 * At forty columns the labels go and the numbers stay, because the numbers are
 * what a player reads mid-game and the labels are what they can afford to lose.
 * Every line is clipped to the width it was given: a HUD line that overruns on
 * a C64 wraps and pushes the board off the screen.
 */
export function hudLines(
  layout: PanelsLayout,
  values: {
    score: number; speed: number; timeText: string; chain: number; stopped: boolean;
    /** Swaps left in a move puzzle; absent in every other mode. */
    movesLeft?: number | null;
    /** Is there a move to take back? */
    canUndo?: boolean;
  },
): string[] {
  const width = layout.hud.width;
  // Clip the VISIBLE text and colour it afterwards. Clipping a tagged string
  // cuts through the tag itself, which paints nothing and leaves the tag open
  // for the rest of the screen.
  const clip = (text: string) => (text.length > width ? text.slice(0, width) : text);
  const tag = (colour: string, text: string) => `{${colour}-fg}${clip(text)}{/${colour}-fg}`;

  if (layout.compact) {
    return [
      clip(`P${values.score}`),
      clip(`L${values.speed}`),
      clip(values.timeText),
      values.chain > 1 ? clip(`x${values.chain}`) : '',
      values.stopped ? clip('STOP') : '',
      values.movesLeft != null ? clip(`M${values.movesLeft}`) : '',
      values.canUndo ? clip('X UNDO') : '',
    ];
  }

  return [
    tag('yellow', 'POINT'),
    clip(`  ${String(values.score).padStart(5, ' ')}`),
    '',
    tag('yellow', 'LEVEL'),
    clip(`  ${String(values.speed).padStart(5, ' ')}`),
    '',
    tag('yellow', 'TIME'),
    clip(`  ${values.timeText.padStart(5, ' ')}`),
    '',
    // The chain counter starts at 2; there is no chain 1.
    values.chain > 1 ? tag('lightmagenta', `x${values.chain} CHAIN`) : '',
    values.stopped ? tag('lightcyan', 'STOP') : '',
    values.movesLeft != null ? tag('white', `MOVES ${values.movesLeft}`) : '',
    values.canUndo ? tag('lightblue', 'X UNDO') : '',
  ];
}
