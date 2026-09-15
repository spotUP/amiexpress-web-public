/**
 * Skitgubbe AI Strategy
 *
 * Skitgubbe is two games in one, and they pull in opposite directions:
 *
 *   PHASE ONE (tricks) you are shopping. Every trick you win becomes your
 *   hand in phase two, so quantity is a liability and QUALITY is what you
 *   are buying: high cards and trumps are the ammunition you will need to
 *   beat your way out later, while low cards are dead weight you would
 *   rather hand to somebody else. So a good player leads rubbish, loses
 *   tricks on purpose when the pile is worthless, and spends as little as
 *   possible on the piles worth taking.
 *
 *   PHASE TWO (shedding) you are escaping. Beat what is in front of you with
 *   the CHEAPEST card that does the job, hoard trumps for the cards you
 *   cannot otherwise answer, and never spend a trump on a pile you could
 *   simply decline - taking one low card back is often cheaper than burning
 *   the ace of trumps.
 *
 * Difficulty scales both the quality of those judgements and the rate at
 * which they are thrown away entirely (`shouldMakeMistake`), so an easy bot
 * is a plausible beginner rather than a slow expert.
 */

import type {
  CardGameAIStrategy,
  DecisionContext,
  AIDecision,
  SkitgubbeAIDecision,
  SkitgubbeDecisionContext,
  SkitgubbeEngine,
} from './types';
import { SkitgubbeActionType, GameType, Difficulty } from './types';
import { getDifficultyConfig, shouldMakeMistake } from './difficulty-config';

type SimpleCard = { rank: string; suit: string };

/** Low to high, ace high - the same order the engine uses. */
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const rankValue = (card: SimpleCard): number => RANK_ORDER.indexOf(card.rank);

/**
 * What a card is worth to its holder in the phase that matters.
 *
 * A trump outranks every plain card, so it carries the whole rank scale as
 * a bonus rather than a fudge factor.
 */
const cardValue = (card: SimpleCard, trump?: string): number =>
  rankValue(card) + (trump !== undefined && card.suit === trump ? RANK_ORDER.length : 0);

export class SkitgubbeAIStrategy implements CardGameAIStrategy {
  getGameType(): GameType {
    return 'skitgubbe';
  }

  async makeDecision(context: DecisionContext): Promise<AIDecision> {
    const { engine, playerId, difficulty } = context as SkitgubbeDecisionContext;
    const state = engine.state;
    const player = state.players.find((p) => p.id === playerId);
    const legal = engine.legalPlays(playerId);

    if (!player) {
      return { type: 'skitgubbe', action: SkitgubbeActionType.TAKE_CARD, reasoning: 'Player not found' };
    }

    // Nothing legal to play: in the shedding phase that means picking the
    // card up, which is the rule rather than a choice.
    if (legal.length === 0) {
      return engine.canTake(playerId)
        ? { type: 'skitgubbe', action: SkitgubbeActionType.TAKE_CARD, reasoning: 'Nothing beats it' }
        : { type: 'skitgubbe', action: SkitgubbeActionType.PLAY_CARD, cardIndex: 0, reasoning: 'No legal play' };
    }

    // A beginner's hand slips. Keep it to a legal move so the game stays
    // valid - the mistake is the CHOICE, not an illegal play.
    if (shouldMakeMistake(difficulty)) {
      const pick = legal[Math.floor(Math.random() * legal.length)];
      return { type: 'skitgubbe', action: SkitgubbeActionType.PLAY_CARD, cardIndex: pick, reasoning: 'Mistake' };
    }

    return state.phase === 'tricks'
      ? this.decideTrickPhase(engine, player.hand, legal, difficulty)
      : this.decideSheddingPhase(engine, playerId, player.hand, legal, difficulty);
  }

  // ------------------------------------------------------------------
  // Phase one - buying the right cards, cheaply
  // ------------------------------------------------------------------

  private decideTrickPhase(
    engine: SkitgubbeEngine,
    hand: SimpleCard[],
    legal: number[],
    difficulty: Difficulty,
  ): SkitgubbeAIDecision {
    const state = engine.state;
    const trump = state.trump;
    const config = getDifficultyConfig(difficulty);
    const leading = state.currentIndex === state.leaderIndex;

    const cheapest = this.lowestOf(hand, legal, trump);
    const dearest = this.highestOf(hand, legal, trump);

    if (leading) {
      // Lead the cheapest card: it baits the answer, and if the answer takes
      // the trick it is our rubbish they are carrying into phase two.
      // A weak bot leads whatever is first in hand.
      return this.play(config.skillLevel >= 0.5 ? cheapest : legal[0],
        'Leading low to shed a weak card');
    }

    // Answering. The pile is everything on the table - a bounced (stunsa)
    // pile can be four cards deep and well worth winning.
    const led = state.table[state.table.length - 1];
    const pileValue = state.table.reduce((sum, card) => sum + cardValue(card, trump), 0);
    const winners = legal.filter((index) => rankValue(hand[index]) > rankValue(led));

    if (winners.length === 0) {
      // Cannot win it. Throw the cheapest thing we have; the opponent is
      // welcome to carry it.
      return this.play(cheapest, 'Cannot win the trick - discarding low');
    }

    // Worth winning? Only if the pile carries real ammunition, or if it is
    // nearly free. A weak bot just grabs.
    const cheapestWinner = this.lowestOf(hand, winners, trump);
    const costOfWinning = cardValue(hand[cheapestWinner], trump);
    const wantsIt = pileValue >= costOfWinning || pileValue >= RANK_ORDER.length;

    if (config.skillLevel < 0.5 || wantsIt) {
      return this.play(cheapestWinner, 'Taking the pile with the cheapest winner');
    }

    // Let it go, and pay as little as possible for the privilege.
    const losers = legal.filter((index) => !winners.includes(index));
    return this.play(losers.length > 0 ? this.lowestOf(hand, losers, trump) : cheapestWinner,
      'Pile is not worth taking - ducking');
  }

  // ------------------------------------------------------------------
  // Phase two - getting out
  // ------------------------------------------------------------------

  private decideSheddingPhase(
    engine: SkitgubbeEngine,
    playerId: string,
    hand: SimpleCard[],
    legal: number[],
    difficulty: Difficulty,
  ): SkitgubbeAIDecision {
    const state = engine.state;
    const trump = state.trump;
    const config = getDifficultyConfig(difficulty);
    const target = state.table[state.table.length - 1];

    if (!target) {
      // Leading a fresh trick: lead low and keep the answers back. Leading a
      // trump when a plain card would do is how a bot loses from in front.
      const plain = legal.filter((index) => hand[index].suit !== trump);
      const pool = plain.length > 0 && config.skillLevel >= 0.5 ? plain : legal;
      return this.play(this.lowestOf(hand, pool, trump), 'Leading low, saving trumps');
    }

    const cheapest = this.lowestOf(hand, legal, trump);
    const spendingATrump = trump !== undefined && hand[cheapest].suit === trump && target.suit !== trump;

    // Beating costs a card; taking costs a card AND the one you pick up. So
    // beat by default - and decline only when the trump we would burn is
    // worth more than the low card we would take back, which is a judgement
    // only the better bots make.
    if (spendingATrump && config.skillLevel >= 0.6 && engine.canTake(playerId)) {
      const trumpCost = cardValue(hand[cheapest], trump);
      const takeCost = rankValue(target) + 1; // +1 for the extra card in hand
      if (trumpCost > takeCost + 2) {
        return { type: 'skitgubbe', action: SkitgubbeActionType.TAKE_CARD, reasoning: 'Cheaper to take than to trump' };
      }
    }

    return this.play(cheapest, 'Beating with the cheapest card that does it');
  }

  // ------------------------------------------------------------------

  private play(cardIndex: number, reasoning: string): SkitgubbeAIDecision {
    return { type: 'skitgubbe', action: SkitgubbeActionType.PLAY_CARD, cardIndex, reasoning };
  }

  private lowestOf(hand: SimpleCard[], indices: number[], trump?: string): number {
    return indices.reduce((best, index) =>
      cardValue(hand[index], trump) < cardValue(hand[best], trump) ? index : best, indices[0]);
  }

  private highestOf(hand: SimpleCard[], indices: number[], trump?: string): number {
    return indices.reduce((best, index) =>
      cardValue(hand[index], trump) > cardValue(hand[best], trump) ? index : best, indices[0]);
  }
}
