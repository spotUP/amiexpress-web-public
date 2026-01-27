/**
 * Card Game AI System
 *
 * Modular, extensible AI system for card games.
 * Uses the Strategy pattern for game-specific implementations.
 */

export { CardGameAI } from './card-game-ai';
export { getDifficultyConfig, applyThinkingDelay, shouldMakeMistake } from './difficulty-config';

export type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  PokerDecisionContext,
  UnoDecisionContext,
  PokerAIDecision,
  UnoAIDecision,
  DifficultyConfig,
  HandStrength,
  PotOdds,
  CardCountingState,
} from './types';

export {
  Difficulty,
  GameType,
  PokerActionType,
  UnoActionType,
} from './types';
