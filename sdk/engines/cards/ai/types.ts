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
 * Generic Skitgubbe engine interface
 * (the engine lives in the card-lobby door, not the SDK - same arrangement
 * as UNO above)
 */
export interface SkitgubbeEngine {
  state: {
    phase: 'tricks' | 'shedding' | 'over';
    players: Array<{
      id: string;
      name: string;
      hand: Array<{ rank: string; suit: string }>;
      won: Array<{ rank: string; suit: string }>;
      out: boolean;
    }>;
    table: Array<{ rank: string; suit: string }>;
    trump?: string;
    stock: Array<{ rank: string; suit: string }>;
    leaderIndex: number;
    currentIndex: number;
  };
  currentPlayerId(): string | null;
  legalPlays(playerId: string): number[];
  canTake(playerId: string): boolean;
}

/**
 * Generic Skitgubbe (vändtia) engine interface
 *
 * The other Swedish game of the same name - three face down, three face up,
 * three in hand, and one pile you must equal or beat. Engine in the
 * card-lobby door, same as the two above.
 */
export interface VandtiaEngine {
  state: {
    phase: 'swap' | 'playing' | 'over';
    players: Array<{
      id: string;
      name: string;
      hand: Array<{ rank: string; suit: string }>;
      faceUp: Array<{ rank: string; suit: string }>;
      faceDown: Array<{ rank: string; suit: string }>;
      ready: boolean;
      out: boolean;
    }>;
    pile: Array<{ rank: string; suit: string }>;
    stock: Array<{ rank: string; suit: string }>;
    currentIndex: number;
  };
  currentPlayerId(): string | null;
  legalPlays(playerId: string): number[];
  cardsInPlay(playerId: string): Array<{ rank: string; suit: string }>;
  sourceFor(playerId: string): 'hand' | 'faceUp' | 'faceDown';
  mustTakePile(playerId: string): boolean;
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
export type GameType = 'poker' | 'uno' | 'skitgubbe' | 'vandtia';

/**
 * Base decision context shared by all games
 */
export interface BaseDecisionContext {
  difficulty: Difficulty;
  playerId: string;
  /**
   * How long this bot should appear to think, in milliseconds, instead of
   * the difficulty's own range. 0 is no pause. A game with hundreds of plays
   * per hand wants a much shorter one than a game with a handful.
   */
  thinkingDelayMs?: number;
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
 * Skitgubbe-specific decision context
 */
export interface SkitgubbeDecisionContext extends BaseDecisionContext {
  engine: SkitgubbeEngine;
}

/**
 * Skitgubbe (vändtia) decision context
 */
export interface VandtiaDecisionContext extends BaseDecisionContext {
  engine: VandtiaEngine;
}

/**
 * Union type for all decision contexts
 */
export type DecisionContext =
  | PokerDecisionContext
  | UnoDecisionContext
  | SkitgubbeDecisionContext
  | VandtiaDecisionContext;

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
 * Skitgubbe action types
 *
 * Two moves and no more: play a card, or - in the shedding phase only -
 * take the card in front of you into your hand.
 */
export enum SkitgubbeActionType {
  PLAY_CARD = 'play',
  TAKE_CARD = 'take',
}

/**
 * Skitgubbe AI decision
 */
export interface SkitgubbeAIDecision {
  type: 'skitgubbe';
  action: SkitgubbeActionType;
  cardIndex?: number; // For play actions - an index into the player's hand
  reasoning?: string; // Optional debug info
}

/**
 * Skitgubbe (vändtia) action types
 *
 * Three moves: swap a hand card onto the table before play, play a card, or
 * pick the pile up because nothing will go on it.
 */
export enum VandtiaActionType {
  SWAP = 'swap',
  FINISH_SWAP = 'finish-swap',
  PLAY_CARD = 'play',
  TAKE_PILE = 'take',
}

/**
 * Skitgubbe (vändtia) AI decision
 */
export interface VandtiaAIDecision {
  type: 'vandtia';
  action: VandtiaActionType;
  /** PLAY_CARD: an index into whichever pile the player is playing from. */
  cardIndex?: number;
  /** SWAP: which hand card, and which face-up card it changes places with. */
  handIndex?: number;
  faceUpIndex?: number;
  reasoning?: string;
}

/**
 * Union type for all AI decisions
 */
export type AIDecision =
  | PokerAIDecision
  | UnoAIDecision
  | SkitgubbeAIDecision
  | VandtiaAIDecision;

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
