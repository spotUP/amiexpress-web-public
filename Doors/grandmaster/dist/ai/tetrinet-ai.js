"use strict";
/**
 * TetriNET AI Player Controller
 *
 * AI logic for TetriNET local multiplayer mode.
 * Supports difficulty levels 1-10 with different behaviors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetAI = void 0;
exports.getAIName = getAIName;
const tetrinet_engine_1 = require("../core/tetrinet/tetrinet-engine");
/**
 * AI player names by difficulty
 */
const AI_NAMES = {
    1: ['Newbie', 'Rookie', 'Beginner'],
    2: ['Student', 'Learner', 'Novice'],
    3: ['Amateur', 'Player', 'Casual'],
    4: ['Skilled', 'Competent', 'Capable'],
    5: ['Adept', 'Experienced', 'Veteran'],
    6: ['Expert', 'Advanced', 'Proficient'],
    7: ['Master', 'Elite', 'Champion'],
    8: ['Grandmaster', 'Legend', 'Ace'],
    9: ['Supreme', 'Ultimate', 'Unstoppable'],
    10: ['Perfect', 'Godlike', 'Inhuman'],
};
/**
 * Think time (ms) by difficulty
 * Lower difficulty = slower reactions
 */
const THINK_TIMES = {
    1: 2000, // 2 seconds
    2: 1500,
    3: 1000,
    4: 800,
    5: 600,
    6: 400,
    7: 300,
    8: 200,
    9: 150,
    10: 100, // 0.1 seconds (fast!)
};
/**
 * Get random AI name for difficulty
 */
function getAIName(difficulty) {
    const names = AI_NAMES[difficulty];
    return names[Math.floor(Math.random() * names.length)];
}
/**
 * TetriNET AI Controller
 */
class TetriNetAI {
    constructor() {
        this.opponents = [];
    }
    /**
     * Create AI opponents
     */
    createOpponents(count, difficulty, settings, gameOptions) {
        this.opponents = [];
        for (let i = 0; i < count; i++) {
            const engine = new tetrinet_engine_1.TetriNetEngine(settings, gameOptions);
            const opponent = {
                id: `ai-${i + 1}`,
                name: getAIName(difficulty),
                engine,
                difficulty,
                thinkTime: THINK_TIMES[difficulty],
                nextMoveTime: Date.now() + THINK_TIMES[difficulty],
                alive: true,
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
     * Update AI opponents (call each game tick)
     */
    update(deltaTime) {
        const now = Date.now();
        for (const opponent of this.opponents) {
            const engineState = opponent.engine.getState();
            if (!opponent.alive || engineState.status === 'gameover') {
                opponent.alive = false;
                continue;
            }
            // Check if it's time for AI to make a move
            if (now >= opponent.nextMoveTime) {
                this.makeMove(opponent);
                opponent.nextMoveTime = now + opponent.thinkTime;
            }
            // Update engine
            opponent.engine.update(deltaTime);
        }
    }
    /**
     * Make a move for AI opponent
     */
    makeMove(opponent) {
        const engine = opponent.engine;
        const state = engine.getState();
        if (!state.currentPiece || state.status !== 'playing') {
            return;
        }
        // AI decision logic based on difficulty
        const action = this.decideAction(opponent);
        switch (action) {
            case 'left':
                engine.move(-1);
                break;
            case 'right':
                engine.move(1);
                break;
            case 'rotate-cw':
                engine.rotate(1);
                break;
            case 'rotate-ccw':
                engine.rotate(-1);
                break;
            case 'soft-drop':
                engine.softDrop();
                break;
            case 'hard-drop':
                engine.hardDrop();
                break;
            case 'use-special':
                this.useSpecial(opponent);
                break;
        }
    }
    /**
     * Decide next action based on difficulty
     */
    decideAction(opponent) {
        const { difficulty, engine } = opponent;
        const state = engine.getState();
        // Higher difficulty = better decisions
        const random = Math.random();
        // Low difficulty: mostly random moves
        if (difficulty <= 3) {
            const actions = ['left', 'right', 'rotate-cw', 'soft-drop', 'hard-drop'];
            return actions[Math.floor(random * actions.length)];
        }
        // Medium difficulty: some strategy
        if (difficulty <= 6) {
            // 30% chance to hard drop
            if (random < 0.3)
                return 'hard-drop';
            // 20% chance to use special
            if (state.inventory.length > 0 && random < 0.5)
                return 'use-special';
            // Otherwise move/rotate
            const actions = ['left', 'right', 'rotate-cw', 'soft-drop'];
            return actions[Math.floor(random * actions.length)];
        }
        // High difficulty: aggressive play
        // 50% chance to hard drop (fast placement)
        if (random < 0.5)
            return 'hard-drop';
        // 30% chance to use special if available
        if (state.inventory.length > 0 && random < 0.8)
            return 'use-special';
        // Otherwise optimize placement
        return this.findBestMove(opponent);
    }
    /**
     * Find best move (for high difficulty AI)
     */
    findBestMove(opponent) {
        const state = opponent.engine.getState();
        if (!state.currentPiece)
            return 'hard-drop';
        // Simple heuristic: try to minimize holes
        // In a real implementation, this would evaluate multiple positions
        const actions = ['left', 'right', 'rotate-cw'];
        return actions[Math.floor(Math.random() * actions.length)];
    }
    /**
     * Use a special block
     */
    useSpecial(opponent) {
        const state = opponent.engine.getState();
        if (state.inventory.length === 0)
            return;
        // Pick random special (simple AI)
        const special = state.inventory[0];
        // Pick random target (in real game, would target strongest opponent)
        const targetId = this.pickTarget(opponent);
        // Use special (note: useSpecial takes optional targetId)
        // In local mode, this targets the specified player
        opponent.engine.useSpecial(targetId);
    }
    /**
     * Pick attack target
     */
    pickTarget(opponent) {
        // In local mode, AI uses specials on themselves or random targets
        // This is a placeholder - real implementation would target human player
        const aliveOpponents = this.opponents.filter(o => o.alive && o.id !== opponent.id);
        if (aliveOpponents.length === 0) {
            return 'player'; // Target human player
        }
        // Random target
        const target = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
        return target.id;
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
exports.TetriNetAI = TetriNetAI;
//# sourceMappingURL=tetrinet-ai.js.map