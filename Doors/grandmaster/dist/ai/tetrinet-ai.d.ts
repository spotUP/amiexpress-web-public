/**
 * TetriNET AI Player Controller
 *
 * AI logic for TetriNET local multiplayer mode.
 * Supports difficulty levels 1-10 with different behaviors.
 */
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { type PlacementEvaluation } from './placement-search';
/**
 * AI difficulty levels
 */
export type AIDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/**
 * Target id the bots use for the human player. The screen's router resolves
 * it to the local engine, so both sides must agree on this string.
 */
export declare const HUMAN_TARGET_ID = "player";
/**
 * AI opponent data
 */
export interface AIOpponent {
    id: string;
    name: string;
    engine: TetriNetEngine;
    difficulty: AIDifficulty;
    thinkTime: number;
    nextMoveTime: number;
    alive: boolean;
    /** Where this bot has decided to put the piece it is holding. */
    target?: PlacementEvaluation | null;
    /** Which piece the plan was made for, so it is redone on a new one. */
    plannedFor?: string | null;
}
/**
 * Get random AI name for difficulty
 */
export declare function getAIName(difficulty: AIDifficulty): string;
/**
 * TetriNET AI Controller
 */
export declare class TetriNetAI {
    private opponents;
    /** Shared with the TGM bot - see ai/placement-search.ts. */
    private search;
    /**
     * Ids the bots may attack besides each other. Defaults to the local human;
     * in a networked match the screen adds the players on other BBS nodes, so
     * bots treat everyone in the game as a target rather than only the people
     * sitting on this node.
     */
    private externalTargets;
    /** Replace the non-bot target pool. Empty falls back to the local human. */
    setExternalTargets(ids: string[]): void;
    /**
     * Create AI opponents
     */
    createOpponents(count: number, difficulty: AIDifficulty, settings: any, gameOptions: any): AIOpponent[];
    /**
     * Get all opponents
     */
    getOpponents(): AIOpponent[];
    /**
     * Update AI opponents (call each game tick)
     */
    update(deltaTime: number): void;
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
    private makeMove;
    /** How eager a bot is to spend a special, by difficulty. */
    private specialChance;
    /**
     * Use a special block
     */
    private useSpecial;
    /**
     * Pick attack target
     */
    private pickTarget;
    /**
     * Check if all AI opponents are dead
     */
    allDead(): boolean;
    /**
     * Cleanup AI opponents
     */
    destroy(): void;
}
//# sourceMappingURL=tetrinet-ai.d.ts.map