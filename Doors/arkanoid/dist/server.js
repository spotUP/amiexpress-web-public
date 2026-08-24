/**
 * ARKANOID - Hybrid Door Server Component
 *
 * This runs in Node.js and handles:
 * - Highscore persistence to disk
 * - RPC calls from client for save/load operations
 */
import * as fs from 'fs';
import * as path from 'path';
const MAX_HIGHSCORES = 10;
/**
 * Get the highscores file path
 */
function getHighscorePath() {
    // Use the arkanoid door directory under Doors/ for hybrid server-side state
    return path.join(process.cwd(), 'Doors', 'arkanoid', 'highscores.json');
}
/**
 * Load highscores from disk
 */
function loadHighscores() {
    try {
        const filePath = getHighscorePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (e) {
        console.error('[Arkanoid Server] Error loading highscores:', e);
    }
    return [];
}
/**
 * Save highscores to disk
 */
function saveHighscores(highscores) {
    try {
        const filePath = getHighscorePath();
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(highscores, null, 2));
    }
    catch (e) {
        console.error('[Arkanoid Server] Error saving highscores:', e);
    }
}
/**
 * RPC Handler: Get highscores
 */
export function getHighscores() {
    const highscores = loadHighscores();
    return { highscores };
}
/**
 * RPC Handler: Save a new highscore
 *
 * Persists to highscores.json, then broadcasts a 'score_submitted' door
 * event - LiveChat shows it, and bbs-event-emitter forwards it to any
 * sysop-configured DOOR_SCORE webhook (Discord/Slack). Same pattern as
 * GrandMaster's score broadcast. The event is strictly best-effort:
 * persistence must succeed even when no session is attached (native runs)
 * or the emitter throws.
 */
export function saveHighscore(params, session) {
    const { name, score, level } = params;
    const entry = {
        name: name.substring(0, 10).toUpperCase(),
        score,
        level,
        date: new Date().toISOString().split('T')[0],
    };
    const highscores = loadHighscores();
    highscores.push(entry);
    highscores.sort((a, b) => b.score - a.score);
    const trimmed = highscores.slice(0, MAX_HIGHSCORES);
    saveHighscores(trimmed);
    try {
        if (session?.bbs?.emitCustomEvent) {
            const rank = trimmed.indexOf(entry) + 1; // 0 -> fell off the board
            const parts = [`Score: ${score.toLocaleString('en-US')}`, `Level: ${level}`];
            if (rank > 0)
                parts.push(`Rank: #${rank}`);
            session.bbs.emitCustomEvent('score_submitted', parts.join(' | '), {
                name: entry.name,
                score,
                level,
                rank: rank > 0 ? rank : undefined,
            });
        }
    }
    catch (e) {
        console.error('[Arkanoid Server] Failed to broadcast score event:', e);
    }
    return { success: true };
}
/**
 * Server component exports for hybrid door
 */
export const rpcHandlers = {
    getHighscores,
    saveHighscore,
};
export default rpcHandlers;
