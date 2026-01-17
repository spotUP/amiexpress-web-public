"use strict";
/**
 * Frogger - Server RPC Handlers
 * High score persistence for the arcade game
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcHandlers = void 0;
const constants_1 = require("./game/constants");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');
/**
 * Load high scores from file
 */
function loadHighscores() {
    try {
        if (fs.existsSync(HIGHSCORES_FILE)) {
            const data = fs.readFileSync(HIGHSCORES_FILE, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error('[Frogger] Error loading highscores:', error);
    }
    return [...constants_1.DEFAULT_HIGHSCORES];
}
/**
 * Save high scores to file
 */
function saveHighscores(scores) {
    try {
        fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(scores, null, 2));
    }
    catch (error) {
        console.error('[Frogger] Error saving highscores:', error);
    }
}
/**
 * RPC handlers for hybrid door mode
 */
exports.rpcHandlers = {
    /**
     * Get high scores list
     */
    getHighscores: async () => {
        return loadHighscores();
    },
    /**
     * Save a new high score
     */
    saveHighscore: async (params) => {
        const scores = loadHighscores();
        // Add new score
        const newScore = {
            name: params.name.toUpperCase().substring(0, 3),
            score: params.score,
            level: params.level,
            date: new Date().toISOString().split('T')[0],
        };
        scores.push(newScore);
        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);
        // Keep top 10
        const topScores = scores.slice(0, 10);
        saveHighscores(topScores);
    },
};
//# sourceMappingURL=server.js.map