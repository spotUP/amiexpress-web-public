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
    saveHighscore: async (params) => {
        const scores = loadHighscores();
        scores.push({
            name: params.name.toUpperCase().substring(0, 3),
            score: params.score,
            level: params.level,
            date: new Date().toISOString().split('T')[0],
        });
        scores.sort((a, b) => b.score - a.score);
        saveHighscores(scores.slice(0, 10));
    },
};
