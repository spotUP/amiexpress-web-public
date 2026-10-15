/**
 * The fonts a web caller's terminal can draw the board in, in menu order.
 *
 * The browser loads exactly these (packages/terminal/src/utils/session-font.ts
 * BBS_FONTS); tests/services/terminal-font.test.ts holds the two lists equal,
 * because the backend cannot import the terminal package. There used to be
 * three more copies here - W row 18 offered five of them under its own
 * numbering and the user stats menu spelled the eight out twice.
 */
export const TERMINAL_FONTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'mosoul', label: "mO'sOul" },
  { id: 'MicroKnight', label: 'MicroKnight' },
  { id: 'MicroKnightPlus', label: 'MicroKnight Plus' },
  { id: 'P0T-NOoDLE', label: 'P0T-NOoDLE' },
  { id: 'Topaz_a500', label: 'Topaz (A500)' },
  { id: 'Topaz_a1200', label: 'Topaz (A1200)' },
  { id: 'TopazPlus_a500', label: 'Topaz Plus (A500)' },
  { id: 'TopazPlus_a1200', label: 'Topaz Plus (A1200)' },
];

/** The board's default, the same on both sides of login. */
export const DEFAULT_TERMINAL_FONT = 'TopazPlus_a1200';
