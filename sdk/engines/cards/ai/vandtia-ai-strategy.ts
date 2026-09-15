/**
 * Skitgubbe (vändtia) AI Strategy
 *
 * The shedding game where the cards you cannot play come back to you by the
 * pileful, so the whole art is deciding what to spend and what to keep:
 *
 *   THE SWAP. What you put face up is what you will be left holding at the
 *   end, when the pile is high and your hand is gone. So the strongest three
 *   go on the table - and "strongest" includes the twos and tens, which
 *   answer anything at all.
 *
 *   THE PILE. Spend the CHEAPEST card that answers, and keep the wild ones
 *   back: a 2 is a get-out-of-jail card and a 10 turns the whole pile away,
 *   which is worth far more when the pile is deep than when it is one card
 *   high. Play the fourth of a kind when it is there - it burns the pile and
 *   hands you another turn.
 *
 *   PICKING UP. When nothing goes, the pile is yours - but a wild card in
 *   hand is a choice, not a formality: burn a big pile rather than carry it,
 *   and do not waste a ten on a single low card when taking it costs one.
 *
 * Difficulty scales the judgement and the rate at which it is thrown away.
 */

import type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  VandtiaAIDecision,
  VandtiaDecisionContext,
  VandtiaEngine,
} from './types';
import { VandtiaActionType, GameType } from './types';
import { getDifficultyConfig, shouldMakeMistake } from './difficulty-config';

type SimpleCard = { rank: string; suit: string };

const CARD_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

const valueOf = (card: SimpleCard): number => CARD_VALUE[card.rank] ?? 0;
const isWild = (card: SimpleCard): boolean => card.rank === '2' || card.rank === '10';

/**
 * What a card is worth to KEEP, which is not the same as its value on the
 * pile: a two beats an ace and a ten clears the table, so both are worth
 * more in hand than their rank suggests.
 */
const keepValue = (card: SimpleCard): number => {
  if (card.rank === '10') return 20;   // clears the pile outright
  if (card.rank === '2') return 16;    // answers anything
  return valueOf(card);
};

/** How much trouble the pile is: what you would be carrying if you took it. */
const pileWeight = (pile: SimpleCard[]): number => pile.length;

export class VandtiaAIStrategy implements CardGameAIStrategy {
  getGameType(): GameType {
    return 'vandtia';
  }

  async makeDecision(context: DecisionContext): Promise<AIDecision> {
    const { engine, playerId, difficulty } = context as VandtiaDecisionContext;
    const state = engine.state;
    const player = state.players.find((p) => p.id === playerId);

    if (!player) {
      return { type: 'vandtia', action: VandtiaActionType.FINISH_SWAP, reasoning: 'Player not found' };
    }

    if (state.phase === 'swap') return this.decideSwap(player, difficulty);

    const legal = engine.legalPlays(playerId);

    // Nothing will go: the pile is yours. That is the rule, not a choice.
    if (legal.length === 0) {
      return { type: 'vandtia', action: VandtiaActionType.TAKE_PILE, reasoning: 'Nothing answers the pile' };
    }

    if (shouldMakeMistake(difficulty)) {
      const pick = legal[Math.floor(Math.random() * legal.length)];
      return { type: 'vandtia', action: VandtiaActionType.PLAY_CARD, cardIndex: pick, reasoning: 'Mistake' };
    }

    return this.decidePlay(engine, playerId, legal, difficulty);
  }

  // ------------------------------------------------------------------

  /**
   * Put the three best cards face up, keeping the rest in hand.
   *
   * A weak bot leaves the deal alone, which is exactly what a beginner does.
   */
  private decideSwap(
    player: { hand: SimpleCard[]; faceUp: SimpleCard[] },
    difficulty: VandtiaDecisionContext['difficulty'],
  ): VandtiaAIDecision {
    const config = getDifficultyConfig(difficulty);
    if (config.skillLevel < 0.4) {
      return { type: 'vandtia', action: VandtiaActionType.FINISH_SWAP, reasoning: 'Happy with the deal' };
    }

    // The best hand card, against the worst card on the table: if the hand
    // card is better, they change places. One swap per decision, so the
    // caller asking repeatedly walks it to the right arrangement.
    let bestHand = -1;
    let worstFaceUp = -1;
    player.hand.forEach((card, index) => {
      if (bestHand < 0 || keepValue(card) > keepValue(player.hand[bestHand])) bestHand = index;
    });
    player.faceUp.forEach((card, index) => {
      if (worstFaceUp < 0 || keepValue(card) < keepValue(player.faceUp[worstFaceUp])) worstFaceUp = index;
    });

    if (bestHand >= 0 && worstFaceUp >= 0
      && keepValue(player.hand[bestHand]) > keepValue(player.faceUp[worstFaceUp])) {
      return {
        type: 'vandtia',
        action: VandtiaActionType.SWAP,
        handIndex: bestHand,
        faceUpIndex: worstFaceUp,
        reasoning: 'Strength belongs on the table',
      };
    }

    return { type: 'vandtia', action: VandtiaActionType.FINISH_SWAP, reasoning: 'Table is strong enough' };
  }

  private decidePlay(
    engine: VandtiaEngine,
    playerId: string,
    legal: number[],
    difficulty: VandtiaDecisionContext['difficulty'],
  ): VandtiaAIDecision {
    const config = getDifficultyConfig(difficulty);
    const cards = engine.cardsInPlay(playerId);
    const pile = engine.state.pile;
    const source = engine.sourceFor(playerId);

    // Face-down cards are turned blind - there is nothing to judge.
    if (source === 'faceDown') {
      return {
        type: 'vandtia',
        action: VandtiaActionType.PLAY_CARD,
        cardIndex: legal[0],
        reasoning: 'Blind card',
      };
    }

    // A fourth of a kind burns the pile and hands back the turn: always
    // worth taking when it is there.
    const top3 = pile.slice(-3);
    if (top3.length === 3 && top3.every((c) => c.rank === top3[0].rank)) {
      const fourth = legal.find((index) => cards[index].rank === top3[0].rank);
      if (fourth !== undefined) {
        return {
          type: 'vandtia',
          action: VandtiaActionType.PLAY_CARD,
          cardIndex: fourth,
          reasoning: 'Fourth of a kind burns the pile',
        };
      }
    }

    const plain = legal.filter((index) => !isWild(cards[index]));
    const wild = legal.filter((index) => isWild(cards[index]));

    // Something ordinary will do: spend the cheapest of it.
    if (plain.length > 0 && config.skillLevel >= 0.4) {
      const cheapest = plain.reduce((best, index) =>
        valueOf(cards[index]) < valueOf(cards[best]) ? index : best, plain[0]);
      return {
        type: 'vandtia',
        action: VandtiaActionType.PLAY_CARD,
        cardIndex: cheapest,
        reasoning: 'Cheapest card that answers',
      };
    }

    // Only a wild card will go. A ten on a deep pile is a bargain; on a
    // shallow one it is a waste, and the better bots would rather keep it -
    // but only when picking the pile up is actually cheap.
    if (plain.length === 0 && wild.length > 0) {
      const ten = wild.find((index) => cards[index].rank === '10');
      const two = wild.find((index) => cards[index].rank === '2');
      const deep = pileWeight(pile) >= 4;

      if (ten !== undefined && (deep || two === undefined)) {
        return {
          type: 'vandtia',
          action: VandtiaActionType.PLAY_CARD,
          cardIndex: ten,
          reasoning: deep ? 'Burning a pile worth burning' : 'Only the ten will go',
        };
      }
      if (two !== undefined) {
        return {
          type: 'vandtia',
          action: VandtiaActionType.PLAY_CARD,
          cardIndex: two,
          reasoning: 'A two answers anything',
        };
      }
    }

    return {
      type: 'vandtia',
      action: VandtiaActionType.PLAY_CARD,
      cardIndex: legal[0],
      reasoning: 'First legal card',
    };
  }
}
