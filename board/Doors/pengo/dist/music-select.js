"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TITLE_TRACK = exports.IN_GAME_TRACK = void 0;
exports.trackForState = trackForState;
/** In the round itself. */
exports.IN_GAME_TRACK = 'pengoingame.mod';
/** The menu, high scores, help, name entry, game over. */
exports.TITLE_TRACK = 'pengotitle.mod';
/**
 * The track for a game state.
 *
 * Never returns null: two tracks cover the whole door, so there is no
 * silent state. The round keeps its track through dying, the level
 * hand-over and pause - those are moments INSIDE the round, and swapping
 * tracks under a two-second interlude would restart the music each time.
 */
function trackForState(state) {
    switch (state) {
        case 'playing':
        case 'dying':
        case 'levelComplete':
        case 'paused':
            return exports.IN_GAME_TRACK;
        default:
            return exports.TITLE_TRACK;
    }
}
//# sourceMappingURL=music-select.js.map