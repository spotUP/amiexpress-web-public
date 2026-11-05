"use strict";
/**
 * Versus Mode AI System
 *
 * Creates AI opponents for CPU Battle mode with their own game engines.
 * Each AI has an independent board visible on minimaps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersusAI = void 0;
exports.getAIName = getAIName;
const game_1 = require("../core/game");
const attack_system_1 = require("../network/attack-system");
const bot_player_1 = require("./bot-player");
/**
 * AI opponent names by difficulty
 */
const AI_NAMES = {
    1: ['Newbie', 'Rookie', 'Trainee'],
    2: ['Scout', 'Learner', 'Student'],
    3: ['Cadet', 'Apprentice', 'Junior'],
    4: ['Soldier', 'Practitioner', 'Regular'],
    5: ['Sergeant', 'Specialist', 'Veteran'],
    6: ['Captain', 'Professional', 'Elite'],
    7: ['Major', 'Expert', 'Ace'],
    8: ['Colonel', 'Master', 'Legend'],
    9: ['General', 'Grandmaster', 'Titan'],
    10: ['Commander', 'God', 'Supreme'],
};
/**
 * Get random AI name for difficulty
 */
function getAIName(difficulty) {
    const names = AI_NAMES[difficulty];
    return names[Math.floor(Math.random() * names.length)];
}
/**
 * Versus AI Controller
 *
 * Manages multiple AI opponents for CPU Battle mode
 */
class VersusAI {
    constructor() {
        this.opponents = [];
    }
    /**
     * Create AI opponents
     */
    createOpponents(count, difficulty, settings, sounds) {
        this.opponents = [];
        for (let i = 0; i < count; i++) {
            // Each AI gets its own attack manager wired into its engine so line
            // clears generate attacks and queued garbage is applied on lock.
            const attackManager = new attack_system_1.AttackManager();
            const engine = new game_1.GameEngine('versus', settings, sounds, attackManager);
            // Create bot controller for this AI's engine
            const bot = new bot_player_1.BotPlayer(difficulty);
            const opponent = {
                id: `ai-${i + 1}`,
                name: `CPU ${getAIName(difficulty)}`,
                engine,
                bot,
                difficulty,
                alive: true,
                attackManager,
            };
            // Start AI engine
            engine.start();
            this.opponents.push(opponent);
        }
        return this.opponents;
    }
    /**
     * Get all opponents
     */
    getOpponents() {
        return this.opponents;
    }
    /**
     * Update all AI opponents (call each game tick)
     */
    update(deltaTime) {
        for (const opponent of this.opponents) {
            if (!opponent.alive)
                continue;
            const state = opponent.engine.getState();
            // Check if AI is game over
            if (state.status === 'gameover') {
                opponent.alive = false;
                continue;
            }
            // Update AI engine (physics, gravity, etc.)
            opponent.engine.update(deltaTime);
            // Update bot AI (make moves)
            opponent.bot.update(deltaTime, opponent.engine);
        }
    }
    /**
     * Get opponent boards for minimap display
     */
    getOpponentBoards() {
        return this.opponents.map(opponent => ({
            id: opponent.id,
            name: opponent.name,
            board: opponent.engine.getState().board,
            alive: opponent.alive,
        }));
    }
    /**
     * Check if all AI opponents are dead
     */
    allDead() {
        return this.opponents.every(o => !o.alive);
    }
    /**
     * Cleanup AI opponents
     */
    destroy() {
        for (const opponent of this.opponents) {
            // Engines will be garbage collected
            opponent.alive = false;
        }
        this.opponents = [];
    }
}
exports.VersusAI = VersusAI;
//# sourceMappingURL=versus-ai.js.map