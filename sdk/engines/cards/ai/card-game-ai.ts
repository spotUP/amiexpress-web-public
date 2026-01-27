/**
 * Card Game AI Orchestrator
 *
 * Main entry point for AI decision-making. Routes decisions to
 * game-specific strategies using the Strategy pattern.
 */

import {
  GameType,
  DecisionContext,
  AIDecision,
  CardGameAIStrategy,
  PokerDecisionContext,
  UnoDecisionContext,
} from './types';
import { applyThinkingDelay } from './difficulty-config';

/**
 * Main AI orchestrator class
 *
 * Manages game-specific AI strategies and delegates decision-making.
 * Strategies are registered at runtime for extensibility.
 */
export class CardGameAI {
  private strategies: Map<GameType, CardGameAIStrategy> = new Map();

  /**
   * Register a strategy for a specific game type
   *
   * @param strategy Game-specific AI strategy implementation
   */
  public registerStrategy(strategy: CardGameAIStrategy): void {
    this.strategies.set(strategy.getGameType(), strategy);
  }

  /**
   * Make an AI decision for a specific game
   *
   * @param gameType Type of game (poker, uno, etc.)
   * @param context Game state and player information
   * @returns AI decision with action to take
   * @throws Error if no strategy registered for game type
   */
  public async makeDecision(
    gameType: GameType,
    context: DecisionContext
  ): Promise<AIDecision> {
    const strategy = this.strategies.get(gameType);

    if (!strategy) {
      throw new Error(
        `No AI strategy registered for game type: ${gameType}. ` +
          `Available strategies: ${Array.from(this.strategies.keys()).join(', ')}`
      );
    }

    // Apply thinking delay for human-like behavior
    await applyThinkingDelay(context.difficulty);

    // Delegate to game-specific strategy
    return strategy.makeDecision(context);
  }

  /**
   * Check if a strategy is registered for a game type
   */
  public hasStrategy(gameType: GameType): boolean {
    return this.strategies.has(gameType);
  }

  /**
   * Get all registered game types
   */
  public getAvailableGames(): GameType[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Convenience method for poker decisions
   */
  public async makePokerDecision(
    context: PokerDecisionContext
  ): Promise<AIDecision> {
    return this.makeDecision('poker', context);
  }

  /**
   * Convenience method for UNO decisions
   */
  public async makeUnoDecision(context: UnoDecisionContext): Promise<AIDecision> {
    return this.makeDecision('uno', context);
  }
}
