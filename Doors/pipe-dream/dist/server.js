/**
 * Pipe Dream - Server RPC Handlers
 */
import { DEFAULT_HIGHSCORES } from './game/constants';
import * as fs from 'fs';
import * as path from 'path';
const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');
function loadHighscores() {
    try {
        if (fs.existsSync(HIGHSCORES_FILE)) {
            return JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf-8'));
        }
    }
    catch { /* ignore */ }
    return [...DEFAULT_HIGHSCORES];
}
function saveHighscores(scores) {
    try {
        fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(scores, null, 2));
    }
    catch { /* ignore */ }
}
export const rpcHandlers = {
    getHighscores: async () => loadHighscores(),
    saveHighscore: async (params, session) => {
        const scores = loadHighscores();
        const entry = {
            name: params.name.toUpperCase().substring(0, 3),
            score: params.score,
            level: params.level,
            date: new Date().toISOString().split('T')[0],
        };
        scores.push(entry);
        scores.sort((a, b) => b.score - a.score);
        const topScores = scores.slice(0, 10);
        saveHighscores(topScores);
        try {
            if (session?.bbs?.emitCustomEvent) {
                const rank = topScores.indexOf(entry) + 1; // 0 -> fell off the board
                const parts = [`Score: ${params.score.toLocaleString('en-US')}`, `Level: ${params.level}`];
                if (rank > 0)
                    parts.push(`Rank: #${rank}`);
                session.bbs.emitCustomEvent('score_submitted', parts.join(' | '), {
                    name: entry.name,
                    score: params.score,
                    level: params.level,
                    rank: rank > 0 ? rank : undefined,
                });
            }
        }
        catch (e) {
            console.error('[Pipe Dream Server] Failed to broadcast score event:', e);
        }
    },
};
