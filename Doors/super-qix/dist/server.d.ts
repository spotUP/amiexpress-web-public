/**
 * Super Qix - Server RPC Handlers
 * Handles persistence operations for hybrid door mode
 */
import { HighScore, KeyMap, GameState } from './game/types';
/**
 * The door's own directory, wherever it is running from.
 *
 * __dirname is Doors/super-qix when the door runs from TypeScript source
 * (dev - door.handler.ts prefers the .ts entry outside production) and
 * Doors/super-qix/dist when it runs compiled. Walking up to the directory
 * holding package.json gives the door root in both cases, so dev and the
 * live board use ONE file instead of drifting apart.
 *
 * This is what HIGHSCORES_PATH used to get wrong: it was
 * path.join(__dirname, 'highscores.json'), which under the compiled door is
 * inside dist/ - and every deploy rebuilds dist/, so the board was wiped
 * each time. Arkanoid was fixed for exactly this; Super Qix never was.
 *
 * It must NOT be derived from process.cwd() either: the backend runs with
 * cwd web/backend, which is outside the Doors volume entirely.
 *
 * startAt exists so a test can prove the walk actually climbs out of dist/.
 * Under tsx, __dirname already IS the door root, so a test that only looked
 * at the resolved path would pass just as happily on the broken version.
 */
export declare function getDoorRoot(startAt?: string): string;
/**
 * Where the high scores live.
 *
 * Exported so a regression test can assert it resolves inside the door's own
 * directory rather than into the dist/ a deploy replaces.
 */
export declare function getHighscorePath(): string;
/** Where per-player settings live, beside the high scores. */
export declare function getSettingsPath(): string;
/** Told by the door whenever the screen changes. */
export declare function setMusicState(state: GameState): void;
/**
 * RPC Handlers for client-server communication
 */
export declare const rpcHandlers: {
    /**
     * Get current high scores list
     */
    getHighscores: () => Promise<HighScore[]>;
    /**
     * Save a new high score if it qualifies
     */
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
        maxPercent: number;
    }) => Promise<{
        success: boolean;
        rank: number;
    }>;
    /**
     * Reset high scores to defaults (admin function)
     */
    resetHighscores: () => Promise<{
        success: boolean;
    }>;
    /**
     * Which tracker module should be playing right now.
     *
     * The door's client is a stub - the game runs here, server-side, so the
     * browser has no way to know what is on screen. Arkanoid's client can
     * drive its own music because Arkanoid's client IS the game; this one
     * cannot, so it asks.
     *
     * Answered from the same pure trackForState the tests cover, so the music
     * cannot drift from the screen. setMusicState is called by the door
     * whenever the state changes.
     */
    getMusicTrack: () => Promise<{
        track: string;
    }>;
    /**
     * This player's saved key bindings, or the defaults if they have none.
     *
     * Keyed by BBS handle so two players on the same board keep their own,
     * and stored outside dist/ so a deploy does not throw them away.
     */
    getSettings: (params: {
        user: string;
    }) => Promise<{
        keyMap: KeyMap;
    }>;
    /**
     * Remember this player's key bindings.
     */
    saveSettings: (params: {
        user: string;
        keyMap: KeyMap;
    }) => Promise<{
        success: boolean;
    }>;
};
export default rpcHandlers;
//# sourceMappingURL=server.d.ts.map