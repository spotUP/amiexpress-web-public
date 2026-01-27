/**
 * Card Game AI System - Core Types and Interfaces
 *
 * Defines the contract for game-specific AI strategies and decision-making.
 * Follows the Strategy pattern for extensibility.
 */

import type { PokerEngine } from '../../poker/poker-engine';

/**
 * Generic UNO engine interface
 * (UNO engine lives in card-lobby door, not SDK)
 */
export interface UnoEngine {
  getState(): any;
  playCard(playerId: string, cardIndex: number, chosenColor?: any): any;
  drawCard(playerId: string): any;
  callUno(playerId: string): void;
  challengeUno(challengerId: string, targetId: string): any;
  challengeWildDrawFour(challengerId: string): any;
}

/**
 * AI difficulty levels
 */
export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXPERT = 'expert',
}

/**
 * Game types supported by the AI system
 */
export type GameType = 'poker' | 'uno';

/**
 * Base decision context shared by all games
 */
export interface BaseDecisionContext {
  difficulty: Difficulty;
  playerId: string;
}

/**
 * Poker-specific decision context
 */
export interface PokerDecisionContext extends BaseDecisionContext {
  engine: PokerEngine;
  seat: number;
}

/**
 * UNO-specific decision context
 */
export interface UnoDecisionContext extends BaseDecisionContext {
  engine: UnoEngine;
}

/**
 * Union type for all decision contexts
 */
export type DecisionContext = PokerDecisionContext | UnoDecisionContext;

/**
 * Poker action types
 */
export enum PokerActionType {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  BET = 'bet',
  RAISE = 'raise',
  ALL_IN = 'all-in',
}

/**
 * Poker AI decision
 */
export interface PokerAIDecision {
  type: 'poker';
  action: PokerActionType;
  amount?: number; // For bet/raise actions
  reasoning?: string; // Optional debug info
}

/**
 * UNO action types
 */
export enum UnoActionType {
  PLAY_CARD = 'play',
  DRAW_CARD = 'draw',
  CHALLENGE = 'challenge',
  CHOOSE_COLOR = 'choose-color',
  CALL_UNO = 'call-uno',
}

/**
 * UNO AI decision
 */
export interface UnoAIDecision {
  type: 'uno';
  action: UnoActionType;
  cardIndex?: number; // For play actions
  color?: string; // For choose-color actions
  reasoning?: string; // Optional debug info
}

/**
 * Union type for all AI decisions
 */
export type AIDecision = PokerAIDecision | UnoAIDecision;

/**
 * Configuration for difficulty-based behavior
 */
export interface DifficultyConfig {
  /**
   * Skill level (0.0 = random, 1.0 = perfect)
   * Used to inject mistakes and suboptimal plays
   */
  skillLevel: number;

  /**
   * Aggression factor (0.0 = passive, 1.0 = very aggressive)
   * Affects betting/raising frequency
   */
  aggression: number;

  /**
   * Thinking delay range in milliseconds
   * Makes AI feel more human-like
   */
  thinkingDelay: {
    min: number;
    max: number;
  };

  /**
   * Game-specific settings
   */
  poker?: {
    usePotOdds: boolean;
    usePositionAwareness: boolean;
    monteCarloSamples: number;
    bluffFrequency: number;
  };

  uno?: {
    useCardCounting: boolean;
    challengeProbability: number;
    strategicColorChoice: boolean;
  };
}

/**
 * Strategy interface for game-specific AI implementations
 *
 * Each game (poker, uno, etc.) implements this interface to provide
 * its own decision-making logic.
 */
export interface CardGameAIStrategy {
  /**
   * Make a decision for the AI player
   *
   * @param context Game state and player information
   * @returns AI decision (action to take)
   */
  makeDecision(context: DecisionContext): Promise<AIDecision>;

  /**
   * Get the game type this strategy handles
   */
  getGameType(): GameType;
}

/**
 * Hand strength estimation for poker
 */
export interface HandStrength {
  /**
   * Raw hand rank (0-9)
   * 0 = high card, 9 = royal flush
   */
  rank: number;

  /**
   * Win equity (0.0-1.0)
   * Probability of winning against random hands
   */
  equity: number;

  /**
   * Hand description for debugging
   */
  description: string;
}

/**
 * Pot odds calculation result
 */
export interface PotOdds {
  /**
   * Amount needed to call
   */
  callAmount: number;

  /**
   * Total pot size after call
   */
  potSize: number;

  /**
   * Pot odds ratio (pot / call)
   */
  odds: number;

  /**
   * Required equity to call profitably
   */
  requiredEquity: number;
}

/**
 * Card counting state for UNO
 */
export interface CardCountingState {
  /**
   * Cards seen by color
   */
  colorCounts: Record<string, number>;

  /**
   * Cards seen by value
   */
  valueCounts: Record<string, number>;

  /**
   * Total cards played
   */
  totalPlayed: number;

  /**
   * Estimated cards remaining in deck
   */
  deckRemaining: number;
}
