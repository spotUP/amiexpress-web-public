/**
 * Poker AI Strategy
 *
 * Implements Texas Hold'em AI with difficulty-based play styles.
 * Uses hand evaluation, pot odds, position awareness, and Monte Carlo simulation.
 */

import type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  PokerAIDecision,
  PokerDecisionContext,
} from './types';
import { PokerActionType, GameType } from './types';
import { getDifficultyConfig, shouldMakeMistake } from './difficulty-config';
import {
  evaluateHandStrength,
  calculateEquity,
  calculatePotOdds,
  isProfitableCall,
} from './utils/hand-strength';

/**
 * Poker AI Strategy Implementation
 */
export class PokerAIStrategy implements CardGameAIStrategy {
  getGameType(): GameType {
    return 'poker';
  }

  async makeDecision(context: DecisionContext): Promise<AIDecision> {
    const pokerContext = context as PokerDecisionContext;
    const { engine, seat, playerId, difficulty } = pokerContext;
    const config = getDifficultyConfig(difficulty);

    const state = engine.state;
    const player = state.players[seat];

    if (!player || !player.hand || player.hand.length !== 2) {
      // Fallback: fold or check
      return this.makeSafeAction(engine, seat, playerId);
    }

    // Get game state
    const holeCards = player.hand;
    const boardCards = state.board;
    const stack = player.stack;
    const currentBet = this.getCurrentBet(state);
    const playerBet = this.getPlayerBet(state, seat);
    const toCall = Math.max(0, currentBet - playerBet);
    const pot = this.calculatePot(state);

    // Evaluate hand strength
    const handStrength = evaluateHandStrength(holeCards, boardCards);

    // Calculate equity if configured
    let equity = handStrength.equity;
    if (config.poker?.monteCarloSamples && config.poker.monteCarloSamples > 0) {
      const activePlayers = state.players.filter((p: any) => p && p.stack > 0).length;
      const numOpponents = Math.max(1, activePlayers - 1);
      equity = calculateEquity(
        holeCards,
        boardCards,
        numOpponents,
        config.poker.monteCarloSamples
      );
    }

    // Position awareness
    const position = this.getPosition(state, seat);
    const positionFactor = config.poker?.usePositionAwareness
      ? this.getPositionFactor(position)
      : 1.0;

    // Adjust equity based on position
    const adjustedEquity = Math.min(1.0, equity * positionFactor);

    // Make mistake if skill level dictates
    if (shouldMakeMistake(difficulty)) {
      return this.makeMistake(engine, seat, playerId, toCall, stack);
    }

    // Decision logic
    if (toCall === 0) {
      // No bet to call - can check or bet
      return this.decideCheckOrBet(
        engine,
        playerId,
        adjustedEquity,
        stack,
        pot,
        config.aggression,
        config.poker?.bluffFrequency ?? 0
      );
    } else {
      // Need to call, raise, or fold
      return this.decideCallRaiseFold(
        engine,
        playerId,
        seat,
        adjustedEquity,
        toCall,
        stack,
        pot,
        config.aggression,
        config.poker?.usePotOdds ?? false
      );
    }
  }

  /**
   * Decide between check and bet when no bet is facing
   */
  private decideCheckOrBet(
    engine: any,
    playerId: string,
    equity: number,
    stack: number,
    pot: number,
    aggression: number,
    bluffFrequency: number
  ): PokerAIDecision {
    const shouldBet = Math.random() < aggression;
    const isBluff = equity < 0.5 && Math.random() < bluffFrequency;

    if ((shouldBet && equity > 0.5) || isBluff) {
      // Bet for value or as bluff
      const betSize = this.calculateBetSize(
        equity,
        pot,
        stack,
        engine.state.bigBlind,
        isBluff
      );

      return {
        type: 'poker',
        action: PokerActionType.BET,
        amount: betSize,
        reasoning: isBluff
          ? `Bluffing with equity ${equity.toFixed(2)}`
          : `Betting for value with equity ${equity.toFixed(2)}`,
      };
    }

    return {
      type: 'poker',
      action: PokerActionType.CHECK,
      reasoning: `Checking with equity ${equity.toFixed(2)}`,
    };
  }

  /**
   * Decide between call, raise, and fold when facing a bet
   */
  private decideCallRaiseFold(
    engine: any,
    playerId: string,
    seat: number,
    equity: number,
    toCall: number,
    stack: number,
    pot: number,
    aggression: number,
    usePotOdds: boolean
  ): PokerAIDecision {
    // Check pot odds
    const potOdds = calculatePotOdds(pot, toCall);
    const isProfitable = usePotOdds ? isProfitableCall(equity, potOdds) : equity > 0.5;

    // All-in situation
    if (stack <= toCall) {
      if (isProfitable) {
        return {
          type: 'poker',
          action: PokerActionType.CALL,
          reasoning: `All-in call with equity ${equity.toFixed(2)}`,
        };
      } else {
        return {
          type: 'poker',
          action: PokerActionType.FOLD,
          reasoning: `Folding all-in with equity ${equity.toFixed(2)}`,
        };
      }
    }

    // Fold if not profitable
    if (!isProfitable) {
      return {
        type: 'poker',
        action: PokerActionType.FOLD,
        reasoning: `Folding - equity ${equity.toFixed(2)} < required ${potOdds.requiredEquity.toFixed(2)}`,
      };
    }

    // Decide between call and raise
    const shouldRaise = equity > 0.65 && Math.random() < aggression;

    if (shouldRaise) {
      const raiseSize = this.calculateRaiseSize(
        engine,
        seat,
        equity,
        pot,
        stack,
        toCall
      );

      return {
        type: 'poker',
        action: PokerActionType.RAISE,
        amount: raiseSize,
        reasoning: `Raising with strong equity ${equity.toFixed(2)}`,
      };
    }

    return {
      type: 'poker',
      action: PokerActionType.CALL,
      reasoning: `Calling with equity ${equity.toFixed(2)}`,
    };
  }

  /**
   * Calculate bet size (60-75% pot for value, 40-60% for bluffs)
   */
  private calculateBetSize(
    equity: number,
    pot: number,
    stack: number,
    bigBlind: number,
    isBluff: boolean
  ): number {
    const potPercent = isBluff ? 0.4 + Math.random() * 0.2 : 0.6 + Math.random() * 0.15;
    const targetBet = Math.floor(pot * potPercent);
    const minBet = bigBlind;
    const maxBet = stack;

    return Math.min(maxBet, Math.max(minBet, targetBet));
  }

  /**
   * Calculate raise size based on equity and pot
   */
  private calculateRaiseSize(
    engine: any,
    seat: number,
    equity: number,
    pot: number,
    stack: number,
    toCall: number
  ): number {
    const state = engine.state;
    const playerBet = this.getPlayerBet(state, seat);
    const maxRaise = playerBet + stack;
    const minRaise = Math.min(state.minRaise, maxRaise);

    // Raise 2-4x the pot for strong hands
    const raiseMultiple = equity > 0.8 ? 3 + Math.random() : 2 + Math.random() * 2;
    const targetRaise = Math.floor(pot * raiseMultiple);

    return Math.min(maxRaise, Math.max(minRaise, targetRaise));
  }

  /**
   * Make a random mistake (for lower difficulties)
   */
  private makeMistake(
    engine: any,
    seat: number,
    playerId: string,
    toCall: number,
    stack: number
  ): PokerAIDecision {
    const mistakes = [PokerActionType.FOLD, PokerActionType.CALL, PokerActionType.CHECK];

    if (toCall === 0) {
      return {
        type: 'poker',
        action: Math.random() < 0.5 ? PokerActionType.CHECK : PokerActionType.BET,
        amount: Math.random() < 0.5 ? engine.state.bigBlind : Math.floor(stack * 0.3),
        reasoning: 'Random mistake',
      };
    }

    const action = Math.random() < 0.7 ? PokerActionType.CALL : PokerActionType.FOLD;
    return {
      type: 'poker',
      action,
      reasoning: 'Random mistake',
    };
  }

  /**
   * Make a safe fallback action
   */
  private makeSafeAction(
    engine: any,
    seat: number,
    playerId: string
  ): PokerAIDecision {
    const state = engine.state;
    const currentBet = this.getCurrentBet(state);
    const playerBet = this.getPlayerBet(state, seat);
    const toCall = Math.max(0, currentBet - playerBet);

    if (toCall === 0) {
      return {
        type: 'poker',
        action: PokerActionType.CHECK,
        reasoning: 'Safe fallback',
      };
    } else {
      return {
        type: 'poker',
        action: PokerActionType.FOLD,
        reasoning: 'Safe fallback',
      };
    }
  }

  /**
   * Get current bet amount in the hand
   */
  private getCurrentBet(state: any): number {
    return Math.max(0, ...state.players.map((p: any) => (p?.bet ?? 0)));
  }

  /**
   * Get player's current bet
   */
  private getPlayerBet(state: any, seat: number): number {
    const player = state.players[seat];
    return player?.bet ?? 0;
  }

  /**
   * Calculate total pot size
   */
  private calculatePot(state: any): number {
    return state.pots.reduce((sum: number, pot: any) => sum + pot.amount, 0);
  }

  /**
   * Get player's position (early, middle, late)
   */
  private getPosition(state: any, seat: number): 'early' | 'middle' | 'late' {
    const dealerSeat = state.dealerButton;
    const numPlayers = state.players.filter((p: any) => p && p.stack > 0).length;

    if (numPlayers <= 3) return 'late';

    const positionFromDealer = (seat - dealerSeat + numPlayers) % numPlayers;

    if (positionFromDealer <= 2) return 'early';
    if (positionFromDealer <= Math.floor(numPlayers / 2)) return 'middle';
    return 'late';
  }

  /**
   * Get position adjustment factor (1.0 = neutral, >1.0 = advantage)
   */
  private getPositionFactor(position: 'early' | 'middle' | 'late'): number {
    switch (position) {
      case 'early':
        return 0.85; // Tighter in early position
      case 'middle':
        return 1.0;
      case 'late':
        return 1.15; // Wider in late position
    }
  }
}
