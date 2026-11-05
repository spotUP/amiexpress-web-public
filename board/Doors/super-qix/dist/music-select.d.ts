/**
 * SUPER QIX - music selection (pure, I/O-free)
 *
 * Maps game state to the tracker module that should be playing. Zabutom XM
 * pack, the two tracks chosen for this door:
 *   - playing (and paused)  -> the cruel king of vendelos
 *   - everywhere else       -> greensleevesFIN2
 *
 * Same shape as Arkanoid's music-select: pure, so it can be tested without a
 * browser, and the single source of which module belongs to which screen.
 * The client calls it on every paint, so the music cannot drift out of step
 * with what is on screen.
 */
import { GameState } from './game/types';
/** In the round itself. */
export declare const IN_GAME_TRACK = "cruel-king-of-vendelos.xm";
/** Menus, high scores, the attract loop, the level hand-over, game over. */
export declare const EVERYWHERE_ELSE_TRACK = "greensleevesFIN2.xm";
/**
 * The track for a game state.
 *
 * Never returns null: Super Qix was asked for two tracks covering the whole
 * door, so there is no silent state. Pausing deliberately keeps the in-game
 * track rather than dropping to the menu tune - a pause is a moment inside
 * the round, and swapping tracks under it would make a two-second pause
 * restart the music.
 */
export declare function trackForState(state: GameState): string;
//# sourceMappingURL=music-select.d.ts.map