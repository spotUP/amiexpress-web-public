/**
 * GRANDMASTER's colours, from the caller's theme.
 *
 * The door spread literal colour names through 4481 lines of dialogs, lists
 * and panels - `bg: 'black'`, `border: { fg: 'cyan' }`, `selected: { bg:
 * 'blue' }` - which is a door that looks identical whatever theme the caller
 * chose. Each literal is now the TOKEN that was standing behind it, so
 * `classic` renders exactly as before (its tokens ARE those names) and every
 * other theme is followed rather than ignored.
 *
 * WHAT THIS DOOR DOES NOT TOKENISE, all of it deliberate:
 *
 * 1. PIECE, CELL AND SPRITE COLOURS. A tetris piece is game art, not chrome.
 *    `core/pieces.ts`, `effects/`, `ui/versus-cells.ts`, `ui/board-effects.ts`
 *    keep their literals, and so do the cell painters inside the two game
 *    screens - the garbage block, the bone block, the lock flash, the ghost
 *    and the particle char. `tests/theme.test.ts` pins the piece table.
 * 2. THE MAGENTA THAT MEANS SOMETHING. No classic token IS magenta, so the
 *    chrome painted with it - the Panels-mode dialogs, the spectate and
 *    bot-difficulty lists, the leaderboard's own box and the HOLD panel -
 *    could not be tokenised without changing classic. The sysop said to
 *    change it (2026-09-15): that chrome takes `accentAlt` now, so it is
 *    cyan under classic and follows every theme. What is left is the game's
 *    own language, which does not move: an m-grade is magenta in TGM, a
 *    combo of five or more is magenta, the T-SPIN flash is magenta.
 * 3. THE GRADE AND COMBO COLOURS. TGM's grades and the combo escalation are
 *    the game's own language (M is red, m is magenta, S is cyan), read by
 *    players from the arcade originals rather than from this board.
 * 4. `ui/manual.ts` AND `ui/attract-screen.ts`. The manual NAMES its colours
 *    in prose beside the swatch it is describing ("I-Piece (Cyan)"), so a
 *    theme would make its own text wrong; the attract screen is drawn art.
 * 5. `MENU_ITEMS`. It is a module-level `const`, evaluated at import time -
 *    BEFORE `applyTheme` runs - so a token there would freeze at classic and
 *    never follow anything. Its per-mode colours are identity art in any
 *    case. Any future const like it has the same trap: make it a function
 *    first, or leave it alone.
 *
 * `T` and `S` are live bindings: `applyTheme` reassigns them once at startup
 * and every use site sees the new values.
 *
 * Copied from mail-composer's `door-theme.ts`, itself DOORMAN's - not
 * reinvented, so all the migrated doors keep one shape.
 */
import { type Theme, type ThemeTokens, type ThemeStyles } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
/** Raw tokens, for tags and style objects. */
export declare let T: ThemeTokens;
/** Ready-made widget styles: panels, frames, bars, lists. */
export declare let S: ThemeStyles;
/** The theme itself, for the few places that need its border or rail. */
export declare let CURRENT: Theme;
/**
 * Re-theme this door.
 *
 * Safe to call with anything - a host with no theme leaves the classic
 * default in place, which is the board exactly as it has always looked.
 */
export declare function applyTheme(source: unknown): void;
//# sourceMappingURL=door-theme.d.ts.map