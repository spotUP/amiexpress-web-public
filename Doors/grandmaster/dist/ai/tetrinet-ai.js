"use strict";
/**
 * TetriNET AI Player Controller
 *
 * AI logic for TetriNET local multiplayer mode.
 * Supports difficulty levels 1-10 with different behaviors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetAI = exports.HUMAN_TARGET_ID = void 0;
exports.getAIName = getAIName;
const tetrinet_engine_1 = require("../core/tetrinet/tetrinet-engine");
const tetrinet_pieces_1 = require("../core/tetrinet/tetrinet-pieces");
const placement_search_1 = require("./placement-search");
const specials_1 = require("../core/tetrinet/specials");
/**
 * Target id the bots use for the human player. The screen's router resolves
 * it to the local engine, so both sides must agree on this string.
 */
exports.HUMAN_TARGET_ID = 'player';
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
        /** Shared with the TGM bot - see ai/placement-search.ts. */
        this.search = new placement_search_1.PlacementSearch();
        /**
         * Ids the bots may attack besides each other. Defaults to the local human;
         * in a networked match the screen adds the players on other BBS nodes, so
         * bots treat everyone in the game as a target rather than only the people
         * sitting on this node.
         */
        this.externalTargets = [exports.HUMAN_TARGET_ID];
    }
    /** Replace the non-bot target pool. Empty falls back to the local human. */
    setExternalTargets(ids) {
        this.externalTargets = ids.length > 0 ? [...ids] : [exports.HUMAN_TARGET_ID];
    }
    /**
     * Create AI opponents
     */
    createOpponents(count, difficulty, settings, gameOptions) {
        this.opponents = [];
        for (let i = 0; i < count; i++) {
            const engine = new tetrinet_engine_1.TetriNetEngine(settings, gameOptions);
            const opponent = {
                target: null,
                plannedFor: null,
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
     * Make a move for AI opponent.
     *
     * The bot plans a placement once per piece with the SAME evaluator the
     * TGM bot uses (ai/placement-search.ts), then walks the piece there one
     * step per think-tick. Before this, decideAction() picked randomly from
     * ['left','right','rotate-cw','soft-drop','hard-drop'] and findBestMove()
     * returned another random action with the comment "In a real
     * implementation, this would evaluate multiple positions" - so TetriNET
     * opponents just shuffled pieces around and topped out.
     */
    makeMove(opponent) {
        const engine = opponent.engine;
        const state = engine.getState();
        if (!state.currentPiece || state.status !== 'playing') {
            return;
        }
        // Use a special first when holding one - a bot that never attacks is
        // not an opponent.
        if (state.inventory.length > 0 && Math.random() < this.specialChance(opponent.difficulty)) {
            this.useSpecial(opponent);
            return;
        }
        const piece = state.currentPiece;
        const pieceKey = `${piece.type}@${state.lines}:${state.score}`;
        if (!opponent.target || opponent.plannedFor !== piece.type) {
            this.search.setDifficulty(opponent.difficulty);
            opponent.target = this.search.findBest(engine.getBoard(), (rotation) => (0, tetrinet_pieces_1.getTetriNetShape)(piece.type, rotation), (0, tetrinet_pieces_1.getRotationCount)(piece.type));
            opponent.plannedFor = piece.type;
        }
        const target = opponent.target;
        if (!target || target.score === -Infinity) {
            engine.hardDrop();
            opponent.target = null;
            opponent.plannedFor = null;
            return;
        }
        // Execute the plan in one tick: rotate, slide, drop. Stepping one key
        // per think-tick looked more human but could not work - at difficulty 5
        // that is 600ms a step, and gravity landed the piece long before it
        // reached its column. think time now paces PIECES, not keystrokes.
        for (let i = 0; i < 4 && engine.getState().currentPiece?.rotation !== target.rotation; i++) {
            if (!engine.rotate(1))
                break;
        }
        for (let i = 0; i < 16; i++) {
            const current = engine.getState().currentPiece;
            if (!current || current.x === target.x)
                break;
            if (!engine.move(current.x < target.x ? 1 : -1))
                break;
        }
        engine.hardDrop();
        opponent.target = null;
        opponent.plannedFor = null;
        void pieceKey;
    }
    /** How eager a bot is to spend a special, by difficulty. */
    specialChance(difficulty) {
        return Math.min(0.6, 0.05 + difficulty * 0.05);
    }
    /**
     * Use a special block
     */
    useSpecial(opponent) {
        const state = opponent.engine.getState();
        const state2 = opponent.engine.getState();
        if (state2.inventory.length === 0)
            return;
        // Self-only specials (Clear Line) are used on the bot's own field; the
        // rest go to somebody else. The old code sent every special to another
        // player, so a bot holding Clear Line threw it away.
        const special = state2.inventory[0];
        const targetId = (0, specials_1.canTargetOthers)(special)
            ? this.pickTarget(opponent)
            : opponent.id;
        opponent.engine.useSpecial(targetId);
    }
    /**
     * Pick attack target
     */
    pickTarget(opponent) {
        // Free-for-all: the human is one target slot among the living bots.
        // Previously 'player' was returned ONLY when every other bot was dead,
        // so while any bot lived the human could not be attacked at all.
        const candidates = this.opponents
            .filter(o => o.alive && o.id !== opponent.id)
            .map(o => o.id);
        candidates.push(...this.externalTargets.filter(id => id !== opponent.id));
        return candidates[Math.floor(Math.random() * candidates.length)];
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