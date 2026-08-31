/**
 * PENGO - music selection (pure, I/O-free)
 *
 * Maps game state to the tracker module that should be playing. Two
 * user-supplied ProTracker MODs:
 *   - in the round (and its interludes)  -> pengoingame.mod
 *   - everywhere else                    -> pengotitle.mod
 *
 * Same shape as Super Qix's and Arkanoid's music-select: pure, so it is
 * tested without a browser, and the single source of which module belongs
 * to which screen. The client polls getMusicTrack, which answers from this,
 * so the music cannot drift from the screen.
 */
import { GameState } from './game/types';
/** In the round itself. */
export declare const IN_GAME_TRACK = "pengoingame.mod";
/** The menu, high scores, help, name entry, game over. */
export declare const TITLE_TRACK = "pengotitle.mod";
/**
 * The track for a game state.
 *
 * Never returns null: two tracks cover the whole door, so there is no
 * silent state. The round keeps its track through dying, the level
 * hand-over and pause - those are moments INSIDE the round, and swapping
 * tracks under a two-second interlude would restart the music each time.
 */
export declare function trackForState(state: GameState): string;
//# sourceMappingURL=music-select.d.ts.map