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
/**
 * How wide a character cell is relative to its height, per screen.
 *
 * This is the fact the first version of the scaling missed, and it is not a
 * detail: it decides what "square" MEANS. An xterm cell is about twice as tall
 * as it is wide, so a 2x1-character panel reads square there. A PETSCII cell
 * is SQUARE, so the same panel is a 2:1 rectangle - which is why the C64 board
 * looked wrong before any scaling existed.
 */
export const CELL_ASPECT = {
  /** xterm, and every ANSI terminal on this board. */
  terminal: 0.5,
  /** PETSCII on a C64: 8x8 pixels, square. */
  petscii: 1,
} as const;

/**
 * The widest a tile may LOOK, however much room there is.
 *
 * Bounding the scale is not the same as bounding the shape, and confusing the
 * two is how a C64 ended up with tiles six characters wide and one row tall:
 * a scale of 3 is harmless on a terminal whose cells are tall, and a smear on
 * a screen whose cells are square. The cap is on what reaches the eye.
 */
const MAX_TILE_ASPECT = 2;

/**
 * What the chrome costs the board, in rows and columns.
 *
 * A frame and a two-row HUD are worth their space on a screen with rows to
 * spare. On a C64 they are the difference between a 2x2 tile and a 1x1 one:
 * twelve panel rows at double height need 24 of the 25 rows there are, so the
 * border and one of the HUD's rows have to go for the tile to double. Making
 * the cost a parameter is what lets the caller decide that.
 */
export interface PanelChrome {
  frameRows: number;
  frameCols: number;
  hudRows: number;
}

const DEFAULT_CHROME: PanelChrome = {
  frameRows: FRAME_ROWS,
  frameCols: FRAME_COLS,
  hudRows: STACKED_HUD_ROWS,
};

export function panelScale(
  screenWidth: number,
  screenHeight: number,
  boardCols: number,
  boardRows: number,
  stacked: boolean,
  cellAspect: number = CELL_ASPECT.terminal,
  chrome: PanelChrome = DEFAULT_CHROME,
): PanelScale {
  // Beside the board, the HUD's columns are not the board's to grow into.
  const usableCols = Math.max(
    1,
    stacked ? screenWidth - chrome.frameCols : screenWidth - chrome.frameCols - GAP - HUD_WIDE,
  );
  const usableRows = Math.max(
    1,
    screenHeight - chrome.frameRows - (stacked ? chrome.hudRows : 0),
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

  // Stacked, the board owns the width and filling it is the point - but only
  // as far as the tile still reads as a tile. A panel is 2 characters wide and
  // `y` rows tall, so on screen it is (2 * x * cellAspect) by y; the widest
  // stretch allowed is whatever keeps that under MAX_TILE_ASPECT.
  //
  // On a terminal that is generous: cells are half as wide as they are tall,
  // so x may reach twice y. On a C64 it is not, because the cells are square -
  // a 2x1 panel is already at the limit there, and stretching it further is
  // what produced the six-to-one smear a caller photographed.
  const widestForShape = Math.max(1, Math.floor((MAX_TILE_ASPECT * fitY) / (2 * cellAspect)));
  return { x: Math.min(fitX, widestForShape), y: fitY };
}

/** Beyond this a bigger tile stops helping and starts wasting the screen. */
const MAX_SCALE = 4;

export interface PanelsLayout {
  /** True at 40 columns: no labels, no chrome, no effects. */
  compact: boolean;
  /** May decorative chrome animate? Never at 40 columns. */
  effects: boolean;
  /** The width tier, for anything that wants to branch further. */
  tier: string;
  board: {
    top: number; left: number; width: number; height: number;
    /**
     * Rows of the bottom panel row that are NOT drawn, so a bottom rule has
     * a row to live on. Zero everywhere there was room for both.
     */
    clipped: number;
  };
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
  cellAspect: number = CELL_ASPECT.terminal,
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

  // ASK WHICH LAYOUT GIVES THE BIGGER BOARD, do not decide by tier.
  //
  // Stacking every "compact" screen put a one-line HUD under a board twelve
  // columns wide with twenty-eight columns of black beside it: "why a minimal
  // hud there in tetris attack? there is plenty of room?" (2026-09-06). But
  // simply preferring the HUD beside the board takes a PHONE's playfield from
  // 36 columns down to 12, because there the HUD's sixteen columns are most
  // of the screen.
  //
  // So compare them. A HUD beside the board is the better shape - it has room
  // for labels rather than initials - and it wins ties; stacking only earns
  // its place by making the board materially bigger, which is exactly the
  // phone. Above the compact tier nothing changes: an 80-column screen has
  // always put the HUD beside and its layout is pinned byte for byte.
  const square = cellAspect >= CELL_ASPECT.petscii;
  const chromeFor = (isStacked: boolean): PanelChrome => (square
    ? { frameRows: 0, frameCols: 0, hudRows: isStacked ? 1 : 0 }
    : DEFAULT_CHROME);
  const area = (isStacked: boolean): number => {
    const s = panelScale(
      screenWidth, screenHeight, boardCols, boardRows, isStacked, cellAspect,
      chromeFor(isStacked),
    );
    return boardCols * s.x * boardRows * s.y;
  };

  const tooNarrowForHud = screenWidth < boardCols + GAP + HUD_WIDE + 2;
  const stacked = portrait
    || tooNarrowForHud
    || (isCompactWidth(screenWidth) && area(true) > area(false));
  const hudWidth = stacked ? screenWidth - (compact ? 0 : FRAME_COLS) : HUD_WIDE;

  // A SQUARE-CELLED SCREEN SPENDS ITS CHROME ON THE TILE.
  //
  // The C64's twenty-five rows hold twelve panel rows at double height only
  // if the border and one of the HUD's two rows give way - 12*2 + 1 = 25
  // exactly. That is the whole difference between a 6x12 board of single
  // characters and a 12x24 one that can be read across the room, and the
  // sysop asked for the bigger tile: "can we make the pieces bigger in tetris
  // attack in petscii mode?" (2026-09-06). Elsewhere there are rows to spare
  // and the frame is worth its space.
  const chrome: PanelChrome = chromeFor(stacked);

  const scale = panelScale(
    screenWidth, screenHeight, boardCols, boardRows, stacked, cellAspect, chrome,
  );
  const width = boardCols * scale.x;
  const fullHeight = boardRows * scale.y;

  const totalWidth = stacked ? width : width + GAP + hudWidth;
  const left = Math.max(1, Math.floor((screenWidth - totalWidth) / 2));
  const hudRows = stacked ? chrome.hudRows : 0;
  const top = stacked
    ? Math.max(0, Math.floor((screenHeight - fullHeight - hudRows) / 2))
    : Math.max(1, Math.floor((screenHeight - fullHeight) / 2));

  // A WELL NEEDS A FLOOR MORE THAN IT NEEDS A WHOLE BOTTOM ROW.
  //
  // Where the tile grew to fill a square-celled screen there is no row left
  // under the board for a bottom rule, and the well was open at the bottom.
  // The sysop's call: "maybe we can allow chopping off half the blocks at the
  // bottom to get a border" (2026-09-07). So the last panel row gives up its
  // bottom half - one row - and the rule takes it.
  //
  // Only where the well is drawn with rules rather than a widget frame
  // (`border === false`), only when the tile is tall enough to have a half to
  // give, and only when there is genuinely no spare row: a screen with room
  // keeps whole panels.
  const spareBelow = screenHeight - (top + fullHeight);
  const clipped = !profile.borders && scale.y > 1 && spareBelow < 1 ? 1 : 0;
  const height = fullHeight - clipped;

  return {
    compact,
    effects: effectsAllowed(screenWidth),
    tier: getBreakpointName(screenWidth),
    board: { top, left, width, height, clipped },
    hud: stacked
      ? {
        top: top + height,
        left,
        width: Math.max(0, Math.min(hudWidth, screenWidth - left)),
        height: hudRows,
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

  if (layout.stacked) {
    // ONE LINE ACROSS, not a column of seven.
    //
    // A HUD UNDER the board is as wide as the screen and one or two rows
    // tall, so a vertical list was the wrong shape for it -
    // and once the C64 board took the height it needed, only the first line
    // had anywhere to be: "size is good but... no hud?" showed a lone `P0`
    // where the score, level, time and chain should all have been
    // (2026-09-06).
    //
    // Ordered by what a player reads mid-game: the chain and the stop clock
    // first when they are live, because they decide the next swap, then the
    // running numbers.
    const parts = [
      values.chain > 1 ? `x${values.chain}` : '',
      values.stopped ? 'STOP' : '',
      values.movesLeft != null ? `M${values.movesLeft}` : '',
      values.canUndo ? 'X=UNDO' : '',
      `P${values.score}`,
      `L${values.speed}`,
      values.timeText,
    ].filter(Boolean);

    // Drop whole fields from the RIGHT until the line fits, rather than
    // slicing a number in half - `P123` cut to `P12` is a lie, a missing
    // field is only missing.
    while (parts.length > 1 && parts.join(' ').length > width) parts.pop();
    return [clip(parts.join(' '))];
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
