/**
 * ARKANOID - music selection (pure, I/O-free)
 *
 * Maps game state to the tracker module that should be playing. Zabutom
 * XM pack, wired 2026-08-24:
 *   - menu (and its help screen)          -> Zb-zfc2.xm
 *   - highscores                          -> DECSYS4.xm
 *   - playing/paused                      -> one of 11 level tracks
 *   - gameover/victory                    -> silence (their jingles stand alone)
 *
 * The game has 20 levels and 11 level tracks, so levels cycle through the
 * rotation: level 12 hears track 1 again, and so on.
 */
export type MusicGameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'highscores' | 'help';
export declare const MENU_TRACK = "Zb-zfc2.xm";
export declare const HIGHSCORE_TRACK = "DECSYS4.xm";
/** Level rotation, in the order the levels meet them. */
export declare const LEVEL_TRACKS: readonly string[];
/**
 * The track for a game state, or null for silence.
 *
 * @param state - current game state
 * @param level - current level, 1-based (only read while playing/paused)
 */
export declare function trackForState(state: MusicGameState, level: number): string | null;
//# sourceMappingURL=music-select.d.ts.map