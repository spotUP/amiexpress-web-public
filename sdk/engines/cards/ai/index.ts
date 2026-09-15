/**
 * Card Game AI System
 *
 * Modular, extensible AI system for card games.
 * Uses the Strategy pattern for game-specific implementations.
 */

export { CardGameAI } from './card-game-ai';
export { SkitgubbeAIStrategy } from './skitgubbe-ai-strategy';
export { VandtiaAIStrategy } from './vandtia-ai-strategy';
export { getDifficultyConfig, applyThinkingDelay, shouldMakeMistake } from './difficulty-config';

export type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  PokerDecisionContext,
  UnoDecisionContext,
  SkitgubbeDecisionContext,
  VandtiaDecisionContext,
  PokerAIDecision,
  UnoAIDecision,
  SkitgubbeAIDecision,
  VandtiaAIDecision,
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
  SkitgubbeActionType,
  VandtiaActionType,
} from './types';
