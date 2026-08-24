/**
 * ARKANOID - music selection (pure, I/O-free)
 *
 * Maps game state to the tracker module that should be playing. Zabutom
 * XM pack, wired 2026-08-24:
 *   - menu (and its help screen)          -> Zb-zfc2.xm
 *   - highscores (viewing and entering)   -> DECSYS4.xm
 *   - playing/paused                      -> one of 11 level tracks
 *   - gameover/victory                    -> silence (their jingles stand alone)
 *
 * The game has 20 levels and 11 level tracks, so levels cycle through the
 * rotation: level 12 hears track 1 again, and so on.
 */
export const MENU_TRACK = 'Zb-zfc2.xm';
export const HIGHSCORE_TRACK = 'DECSYS4.xm';
/** Level rotation, in the order the levels meet them. */
export const LEVEL_TRACKS = [
    'EMERALD.XM',
    'WORDS8.xm',
    'ZB_BVBL.XM',
    'ZB_ZFX2.XM',
    'ZB-BLMND.XM',
    'ZB-CL2M.XM',
    'ZB-RCS2.XM',
    'Zb-trhz.xm',
    'ZB-WRDOI.XM',
    'ZBT-SSU.XM',
    'ZBT-ZFC.XM',
];
/**
 * The track for a game state, or null for silence.
 *
 * @param state - current game state
 * @param level - current level, 1-based (only read while playing/paused)
 */
export function trackForState(state, level) {
    switch (state) {
        case 'menu':
        case 'help':
            return MENU_TRACK;
        case 'highscores':
        case 'enterName':
            return HIGHSCORE_TRACK;
        case 'playing':
        case 'paused': {
            const index = (Math.max(1, Math.floor(level)) - 1) % LEVEL_TRACKS.length;
            return LEVEL_TRACKS[index];
        }
        default:
            return null;
    }
}
