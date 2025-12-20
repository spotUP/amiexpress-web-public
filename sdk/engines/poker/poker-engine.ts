/**
 * Poker Engine - Texas Hold'em Game Logic
 *
 * Wraps @pokertools/engine with BBS-friendly helpers and CardEngine rendering.
 */

import {
  PokerEngine as CorePokerEngine,
  ActionType,
  type Action,
  type ExportOptions,
  type GameState,
  type HandHistory,
  type Player,
  type PublicState,
  type TableConfig,
} from '@pokertools/engine';
import {
  CardEngine,
  parseCardString,
  type Card,
  type HandRenderOptions,
} from '../cards/card-engine';

export type { Action, ExportOptions, GameState, HandHistory, Player, PublicState, TableConfig };
export { ActionType };
export {
  auditChipConservation,
  calculateTotalChips,
  createPublicView,
  createSnapshot,
  exportHandHistory,
  exportMultipleHands,
  getHandHistory,
  restoreFromSnapshot,
} from '@pokertools/engine';
export type { Snapshot } from '@pokertools/engine';

export interface PokerEngineOptions {
  cardEngine?: CardEngine;
  timeProvider?: () => number;
}

export const normalizePokerCardString = (card: string): string => {
  const trimmed = card.trim();
  if (!trimmed) {
    throw new Error('Card string cannot be empty.');
  }

  const upper = trimmed.toUpperCase();
  const suit = upper.slice(-1);
  const rankPart = upper.slice(0, -1);
  const normalizedRank = rankPart === 'T' ? '10' : rankPart;
  return `${normalizedRank}${suit}`;
};

export const pokerCardToCard = (card: string): Card => {
  return parseCardString(normalizePokerCardString(card));
};

export const pokerCardsToCards = (cards: readonly string[]): Card[] => {
  return cards.map(pokerCardToCard);
};

export class PokerEngine extends CorePokerEngine {
  private cardEngine: CardEngine;

  constructor(config: TableConfig, options: PokerEngineOptions = {}) {
    super(config, options.timeProvider);
    this.cardEngine = options.cardEngine ?? new CardEngine();
  }

  public getBoardCards(): Card[] {
    return pokerCardsToCards(this.state.board);
  }

  public getPlayerHandCards(playerId: string): Card[] {
    const player = this.state.players.find((seat) => seat?.id === playerId);
    if (!player?.hand) {
      return [];
    }
    return pokerCardsToCards(player.hand);
  }

  public renderBoard(options?: HandRenderOptions): string {
    return this.cardEngine.renderHand(this.getBoardCards(), options);
  }

  public renderBoardLines(options?: HandRenderOptions): string[] {
    return this.cardEngine.renderHandLines(this.getBoardCards(), options);
  }

  public renderPlayerHand(playerId: string, options?: HandRenderOptions): string {
    return this.cardEngine.renderHand(this.getPlayerHandCards(playerId), options);
  }

  public renderPlayerHandLines(playerId: string, options?: HandRenderOptions): string[] {
    return this.cardEngine.renderHandLines(this.getPlayerHandCards(playerId), options);
  }
}
