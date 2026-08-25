/**
 * On-screen control layouts for game-mode doors.
 *
 * Two shapes exist, because the two games take fundamentally different input:
 *
 *  - `pad` (GRANDMASTER) - discrete keys. Every control is a real browser
 *    key name/code pair, sent through the terminal's game-mode key path
 *    (BBSTerminalRef.pressGameKey / releaseGameKey), which is the same path a
 *    physical keyboard uses, so held keys, DAS/ARR and key repeat behave
 *    identically.
 *
 *  - `spinner` (ARKANOID) - an ABSOLUTE pointer. Doors/arkanoid/client.ts
 *    steers the paddle from mouse-hover / mouse-drag / mouse-up alike, always
 *    as `paddle.x = mouseX - width/2`, so the paddle follows the pointer's X
 *    directly. Arrow keys only nudge it a step at a time (`movePaddle`), which
 *    throws away the spinner feel the game is built around - so the on-screen
 *    control is a trackpad strip driving BBSTerminalRef.sendMouse, not buttons.
 *
 * The key names below come from the doors themselves:
 *  - GMASTER: Doors/grandmaster/input/config.ts (DEFAULT_KEYS/TETRINET_KEYS),
 *    mapped back to browser names by InputHandler.browserKeyName().
 *  - ARKANOID: Doors/arkanoid/client.ts, which lower-cases KeyboardEvent.key.
 */

export interface GameControlDef {
  /** Stable id, unique inside a layout. */
  id: string;
  /** Button face. Full words - abbreviations are not readable at thumb size. */
  label: string;
  /** Spoken label when the face is shortened. */
  ariaLabel?: string;
  /** KeyboardEvent.key value the door expects. */
  key: string;
  /** KeyboardEvent.code value the door expects. */
  code: string;
}

/**
 * One thumb's worth of keys.
 *
 * `role` is presentation only - it picks the accent the movement keys get -
 * and is deliberately NOT the thing that decides which side the cluster sits
 * on. Which side a cluster is on is the field it is stored in (`left`/`right`),
 * so a layout can put movement under either thumb.
 */
export interface GameControlCluster {
  role: 'movement' | 'actions';
  keys: GameControlDef[];
}

export interface GameControlPad {
  kind: 'pad';
  /** Door this pad belongs to, shown on the pad. */
  title: string;
  /** Cluster under the LEFT thumb. */
  left: GameControlCluster;
  /** Cluster under the RIGHT thumb. */
  right: GameControlCluster;
}

export interface GameControlSpinner {
  kind: 'spinner';
  /** Door this pad belongs to, shown on the pad. */
  title: string;
  /**
   * Terminal row (0-indexed) the trackpad reports its Y at. Only X matters
   * while the game is playing, but the row still has to land inside the play
   * area: the door hit-tests Y against its menu rows when it is NOT playing,
   * and a stray hover there would move the menu selection.
   */
  row: number;
  /** Keyboard buttons beside the strip. */
  keys: GameControlDef[];
}

export type GameControlLayout = GameControlPad | GameControlSpinner;

/**
 * GMASTER.
 *
 * Thumb assignment: ROTATE under the left thumb, MOVE under the right. Every
 * binding here except Hard Drop is valid in BOTH of the door's layouts:
 * DEFAULT_KEYS and TETRINET_KEYS agree on the arrows for left/right/soft drop,
 * on x/z for the two rotations, and both accept 'c' for hold. Hard drop is the
 * one collision - ArrowUp under DEFAULT_KEYS, Space under TETRINET_KEYS - and
 * the frontend has no signal telling it which screen is running, so the pad
 * uses the default (TGM) binding.
 *
 * Hard Drop takes the wide slot under Left/Right because it is used on nearly
 * every piece; Soft Drop is the rarer one and sits in the rotate cluster.
 */
const TETRIS_LAYOUT: GameControlPad = {
  kind: 'pad',
  title: 'GRANDMASTER',
  left: {
    role: 'actions',
    keys: [
      {
        id: 'rotate-ccw',
        label: 'Rotate Left',
        ariaLabel: 'Rotate counter-clockwise',
        key: 'z',
        code: 'KeyZ',
      },
      {
        id: 'rotate-cw',
        label: 'Rotate Right',
        ariaLabel: 'Rotate clockwise',
        key: 'x',
        code: 'KeyX',
      },
      { id: 'soft-drop', label: 'Soft Drop', key: 'ArrowDown', code: 'ArrowDown' },
      { id: 'hold', label: 'Hold', key: 'c', code: 'KeyC' },
    ],
  },
  right: {
    role: 'movement',
    keys: [
      { id: 'left', label: 'Left', key: 'ArrowLeft', code: 'ArrowLeft' },
      { id: 'right', label: 'Right', key: 'ArrowRight', code: 'ArrowRight' },
      { id: 'hard-drop', label: 'Hard Drop', key: 'ArrowUp', code: 'ArrowUp' },
    ],
  },
};

/**
 * ARKANOID: a trackpad strip, plus Pause.
 *
 * Launch is NOT listed here - it sends a mouse click, not a key, so it belongs
 * to the trackpad component rather than to this key table.
 *
 * Pause is 'p'. Space also pauses in the door, but only when no ball is
 * waiting to be launched, so Space would launch the ball instead of pausing
 * about half the time (Doors/arkanoid/client.ts handleGameInput).
 *
 * Row 19 (0-indexed) is PADDLE_Y: the door's GAME_TOP 3 + GAME_HEIGHT 19 - 2
 * = 20 in its own 1-indexed space, and the door adds 1 to whatever the
 * frontend sends. It is well clear of the menu rows (1-indexed 10..14).
 */
const ARKANOID_LAYOUT: GameControlSpinner = {
  kind: 'spinner',
  title: 'ARKANOID',
  row: 19,
  keys: [
    { id: 'pause', label: 'Pause', key: 'p', code: 'KeyP' },
  ],
};

/**
 * Door ids that get a pad. The id is whatever the backend sends with
 * door:load-client, which is the BBS command name lower-cased (GMASTER.info
 * -> "gmaster"); the extra entries cover the aliases the doors declare for
 * themselves so a renamed .info still finds its pad.
 */
export const GAME_CONTROL_LAYOUTS: Readonly<Record<string, GameControlLayout>> = {
  gmaster: TETRIS_LAYOUT,
  grandmaster: TETRIS_LAYOUT,
  tetris: TETRIS_LAYOUT,
  tgm: TETRIS_LAYOUT,
  arkanoid: ARKANOID_LAYOUT,
};

/** Every keyboard control in a layout, left cluster first. */
export function layoutControls(layout: GameControlLayout): GameControlDef[] {
  return layout.kind === 'pad'
    ? [...layout.left.keys, ...layout.right.keys]
    : [...layout.keys];
}

/**
 * Pad for a door id, or null when the door has no game-specific controls (the
 * generic on-screen keyboard stays in place for those).
 */
export function findGameControlLayout(doorId: string | null | undefined): GameControlLayout | null {
  if (!doorId) return null;
  const normalized = doorId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return GAME_CONTROL_LAYOUTS[normalized] ?? null;
}

/**
 * Map a position across the trackpad strip onto a terminal column.
 *
 * `fraction` is 0 at the strip's left edge and 1 at its right edge, so the
 * thumb's travel covers the whole grid: the leftmost column the door can see
 * (0 here, which it reads as column 1) through the rightmost (`columns - 1`,
 * column 80 on a standard grid). That is what makes the strip absolute - the
 * paddle sits where the thumb is, exactly as it sits where the mouse is on the
 * desktop - instead of nudging a step per press.
 */
export function trackpadColumn(fraction: number, columns: number): number {
  const cols = Math.max(1, Math.floor(columns));
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return Math.round(clamped * (cols - 1));
}

/**
 * How far the paddle travels for a given thumb travel.
 *
 * A real spinner is relative and geared: a small twist crosses the whole
 * playfield. Mapping the strip absolutely meant a full-width sweep of the
 * thumb for a full-width sweep of the paddle, which is a long way to reach
 * on a phone (reported live 2026-08-25). Above 1 the paddle outruns the
 * thumb; 2 crosses the board in half a strip.
 */
export const TRACKPAD_GAIN = 2.2;

/**
 * Next paddle column for a thumb that moved from `fromFraction` to
 * `toFraction` across the strip.
 *
 * Relative, like a mouse: the paddle continues from where it was rather
 * than teleporting under the thumb, so putting a finger down never moves
 * it, and lifting and re-planting the thumb mid-sweep keeps going instead
 * of snapping.
 */
export function trackpadStep(
  currentColumn: number,
  fromFraction: number,
  toFraction: number,
  columns: number,
  gain: number = TRACKPAD_GAIN,
): number {
  const cols = Math.max(1, Math.floor(columns));
  const delta = (toFraction - fromFraction) * (cols - 1) * gain;
  if (!Number.isFinite(delta)) return currentColumn;

  return Math.max(0, Math.min(cols - 1, Math.round(currentColumn + delta)));
}
