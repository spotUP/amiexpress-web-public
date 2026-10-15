/**
 * UNO AI Strategy
 *
 * Implements UNO AI with difficulty-based play styles.
 * Uses card counting, strategic color selection, and challenge timing.
 */

import type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  UnoAIDecision,
  UnoDecisionContext,
  CardCountingState,
} from './types';
import { UnoActionType, GameType } from './types';
import { getDifficultyConfig, shouldMakeMistake } from './difficulty-config';
import {
  initializeCardCounting,
  trackCard,
  chooseBestColor,
} from './utils/card-counting';

/**
 * UNO AI Strategy Implementation
 */
export class UnoAIStrategy implements CardGameAIStrategy {
  private cardCounting: Map<string, CardCountingState> = new Map();
  private lastDiscardCount: Map<string, number> = new Map(); // Track last discard pile size

  getGameType(): GameType {
    return 'uno';
  }

  async makeDecision(context: DecisionContext): Promise<AIDecision> {
    const unoContext = context as UnoDecisionContext;
    const { engine, playerId, difficulty } = unoContext;
    const config = getDifficultyConfig(difficulty);

    const state = engine.getState();
    const player = state.players.find((p: any) => p.id === playerId);

    if (!player) {
      // Fallback: draw a card
      return {
        type: 'uno',
        action: UnoActionType.DRAW_CARD,
        reasoning: 'Player not found',
      };
    }

    // Initialize card counting if needed
    if (!this.cardCounting.has(playerId)) {
      this.cardCounting.set(playerId, initializeCardCounting());
    }

    // Update card counting with discard pile
    if (config.uno?.useCardCounting) {
      this.updateCardCounting(playerId, state.discardPile);
    }

    // Check for challenge opportunities
    if (state.challengeWindow) {
      const shouldChallenge = this.shouldChallenge(
        state.challengeWindow,
        playerId,
        config.uno?.challengeProbability ?? 0
      );

      if (shouldChallenge) {
        return {
          type: 'uno',
          action: UnoActionType.CHALLENGE,
          reasoning: 'Challenging based on probability',
        };
      }
    }

    // Check if we need to call UNO
    if (player.hand.length === 2 && !player.calledUno) {
      // Call UNO before playing
      return {
        type: 'uno',
        action: UnoActionType.CALL_UNO,
        reasoning: 'Calling UNO preemptively',
      };
    }

    // Find playable cards
    const playableCards = this.findPlayableCards(player.hand, state);

    if (playableCards.length === 0) {
      // No playable cards - must draw
      return {
        type: 'uno',
        action: UnoActionType.DRAW_CARD,
        reasoning: 'No playable cards',
      };
    }

    // Make a mistake if skill level dictates
    if (shouldMakeMistake(difficulty)) {
      return this.makeMistake(playableCards, player.hand);
    }

    // Choose best card to play
    const bestCard = this.chooseBestCard(
      playableCards,
      player.hand,
      state,
      config
    );

    // Check if card needs color choice
    if (
      bestCard.card.value === 'Wild' ||
      bestCard.card.value === 'Wild4' ||
      bestCard.card.value === 'WildChange'
    ) {
      const handColors = player.hand
        .filter((c: any) => c.color !== 'W')
        .map((c: any) => c.color);

      const countingState = this.cardCounting.get(playerId)!;
      const chosenColor = chooseBestColor(
        handColors,
        countingState,
        config.uno?.strategicColorChoice ?? false
      );

      return {
        type: 'uno',
        action: UnoActionType.CHOOSE_COLOR,
        cardIndex: bestCard.index,
        color: chosenColor,
        reasoning: `Playing ${bestCard.card.id} and choosing ${chosenColor}`,
      };
    }

    return {
      type: 'uno',
      action: UnoActionType.PLAY_CARD,
      cardIndex: bestCard.index,
      reasoning: `Playing ${bestCard.card.id}`,
    };
  }

  /**
   * Find all cards that can be played
   */
  private findPlayableCards(
    hand: any[],
    state: any
  ): Array<{ card: any; index: number }> {
    const topCard = state.discardPile[state.discardPile.length - 1];
    const currentColor = state.currentColor;

    return hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => {
        // Wild cards can always be played
        if (
          card.value === 'Wild' ||
          card.value === 'Wild4' ||
          card.value === 'WildChange' ||
          card.value.startsWith('HR')
        ) {
          return true;
        }

        // Match color or value
        return card.color === currentColor || card.value === topCard.value;
      });
  }

  /**
   * Choose the best card to play based on strategy
   */
  private chooseBestCard(
    playableCards: Array<{ card: any; index: number }>,
    hand: any[],
    state: any,
    config: any
  ): { card: any; index: number } {
    // Priority order:
    // 1. Action cards (Skip, Reverse, Draw2) - disrupt opponents
    // 2. Color match - keep the flow going
    // 3. Number cards - least valuable
    // 4. Wild cards - save for last resort

    // Action cards
    const actionCards = playableCards.filter((c) =>
      ['Skip', 'Reverse', 'Draw2'].includes(c.card.value)
    );
    if (actionCards.length > 0) {
      return actionCards[0];
    }

    // Color match (non-wild)
    const colorMatches = playableCards.filter(
      (c) => c.card.color === state.currentColor && c.card.color !== 'W'
    );
    if (colorMatches.length > 0) {
      return colorMatches[0];
    }

    // Number cards
    const numberCards = playableCards.filter(
      (c) => !isNaN(parseInt(c.card.value)) && c.card.color !== 'W'
    );
    if (numberCards.length > 0) {
      return numberCards[0];
    }

    // Wild cards (last resort)
    return playableCards[0];
  }

  /**
   * Make a random mistake (for lower difficulties)
   */
  private makeMistake(
    playableCards: Array<{ card: any; index: number }>,
    hand: any[]
  ): UnoAIDecision {
    // 50% chance to draw when we could play
    if (Math.random() < 0.5) {
      return {
        type: 'uno',
        action: UnoActionType.DRAW_CARD,
        reasoning: 'Random mistake - drawing instead of playing',
      };
    }

    // Play a random playable card
    const randomCard =
      playableCards[Math.floor(Math.random() * playableCards.length)];

    return {
      type: 'uno',
      action: UnoActionType.PLAY_CARD,
      cardIndex: randomCard.index,
      reasoning: 'Random mistake - playing random card',
    };
  }

  /**
   * Decide whether to challenge based on probability
   */
  private shouldChallenge(
    challengeWindow: any,
    playerId: string,
    challengeProbability: number
  ): boolean {
    // Don't challenge if we're not eligible
    if (!challengeWindow.eligibleChallengers.includes(playerId)) {
      return false;
    }

    // UNO challenges - always challenge if we notice
    if (challengeWindow.type === 'uno') {
      return Math.random() < challengeProbability;
    }

    // Wild Draw 4 challenges - probability-based
    if (challengeWindow.type === 'wild-draw-four') {
      // If we know it was illegal, challenge more often (but cap at 1.0)
      if (challengeWindow.wasIllegalWildDrawFour) {
        return Math.random() < Math.min(1.0, challengeProbability * 1.5);
      }

      // Otherwise, challenge based on base probability
      return Math.random() < challengeProbability * 0.5;
    }

    return false;
  }

  /**
   * Update card counting state with new cards from discard pile
   */
  private updateCardCounting(playerId: string, discardPile: any[]): void {
    const state = this.cardCounting.get(playerId);
    if (!state) return;

    // Only track NEW cards since last update
    const lastCount = this.lastDiscardCount.get(playerId) ?? 0;
    const newCards = discardPile.slice(lastCount);

    for (const card of newCards) {
      trackCard(state, card.color, card.value);
    }

    // Update the last count
    this.lastDiscardCount.set(playerId, discardPile.length);
  }
}
