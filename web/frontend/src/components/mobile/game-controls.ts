/**
 * On-screen control layouts for game-mode doors.
 *
 * Every control is a real browser key name/code pair. They are sent through
 * the terminal's game-mode key path (BBSTerminalRef.pressGameKey /
 * releaseGameKey), which is the same path a physical keyboard uses, so held
 * keys, DAS/ARR and key repeat behave identically.
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

export interface GameControlLayout {
  /** Door this pad belongs to, shown on the pad. */
  title: string;
  /** Left-thumb cluster: movement. */
  movement: GameControlDef[];
  /** Right-thumb cluster: actions. */
  actions: GameControlDef[];
}

/**
 * GMASTER.
 *
 * Every binding here except Hard Drop is valid in BOTH of the door's layouts:
 * DEFAULT_KEYS and TETRINET_KEYS agree on the arrows for left/right/soft drop,
 * on x/z for the two rotations, and both accept 'c' for hold. Hard drop is the
 * one collision - ArrowUp under DEFAULT_KEYS, Space under TETRINET_KEYS - and
 * the frontend has no signal telling it which screen is running, so the pad
 * uses the default (TGM) binding.
 */
const TETRIS_LAYOUT: GameControlLayout = {
  title: 'GRANDMASTER',
  movement: [
    { id: 'left', label: 'Left', key: 'ArrowLeft', code: 'ArrowLeft' },
    { id: 'right', label: 'Right', key: 'ArrowRight', code: 'ArrowRight' },
    { id: 'soft-drop', label: 'Soft Drop', key: 'ArrowDown', code: 'ArrowDown' },
  ],
  actions: [
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
    { id: 'hard-drop', label: 'Hard Drop', key: 'ArrowUp', code: 'ArrowUp' },
    { id: 'hold', label: 'Hold', key: 'c', code: 'KeyC' },
  ],
};

/** ARKANOID: paddle left/right are held; Space launches the ball / fires. */
const ARKANOID_LAYOUT: GameControlLayout = {
  title: 'ARKANOID',
  movement: [
    { id: 'left', label: 'Left', key: 'ArrowLeft', code: 'ArrowLeft' },
    { id: 'right', label: 'Right', key: 'ArrowRight', code: 'ArrowRight' },
  ],
  actions: [
    { id: 'launch', label: 'Launch', key: ' ', code: 'Space' },
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

/** Every control in a layout, movement first. */
export function layoutControls(layout: GameControlLayout): GameControlDef[] {
  return [...layout.movement, ...layout.actions];
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
