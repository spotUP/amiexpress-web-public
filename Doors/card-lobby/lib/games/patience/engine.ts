/**
 * PATIENCE, PLAYED FROM A DEFINITION.
 *
 * `parser.ts` reads csol's `.game` files; this plays them. Nothing here knows
 * what Klondike is - it knows piles, and the rules a pile applies to a card
 * arriving on it:
 *
 *   first_rank   what an EMPTY pile accepts (an ace on a foundation, a king
 *                on a Klondike column, anything in Freecell, nothing at all
 *                on a Spider tableau)
 *   next_rank    how a card must relate to the one it lands on - up, down,
 *                up_down for Golf, same, or any
 *   next_suit    same, diff, same_color, diff_color, any, none
 *   from         which pile TYPES may send a card here
 *   move_group   how many cards may leave a pile at once: the top one, a
 *                valid run, the whole pile, or any number
 *   valid_group  what a moved run must look like within itself
 *   same_class   rules that REPLACE the above between piles of one class,
 *                which is how Spider says "any card may sit on any card
 *                between tableaus, but only a run may move"
 *
 * Add a game by adding a file. That is the whole point of it.
 */

import { buildStandardDeck, shuffleCards, type Card, type Rank } from '@amiexpress/bbs-door-sdk';
import type {
  GameDefinition,
  PileDefinition,
  PileRules,
  PileType,
  RankRule,
  SuitRule,
} from './parser';

export type PatienceSuit = 'S' | 'H' | 'D' | 'C';

export interface PatienceCard {
  rank: Rank;
  suit: PatienceSuit;
  /** Face-down cards are dealt by `hide` and turned as the pile is played. */
  faceUp: boolean;
}

export interface PatiencePile {
  /** `tableau:0`, `foundation:3` - stable, and what a move names. */
  id: string;
  type: PileType;
  index: number;
  x: number;
  y: number;
  cards: PatienceCard[];
  rules: PileDefinition;
}

export interface PatienceState {
  name: string;
  title: string;
  piles: PatiencePile[];
  /** How many times the stock has been turned over and re-dealt. */
  redeals: number;
  moves: number;
  won: boolean;
}

export interface PatienceResult {
  success: boolean;
  message: string;
}

export interface PatienceSnapshot {
  name: string;
  piles: Array<{ id: string; cards: string[] }>;
  redeals: number;
  moves: number;
  won: boolean;
}

// ============================================================================
// Cards
// ============================================================================

const RANK_VALUE: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13,
};

/** csol writes ranks lower-case and spells the king two ways. */
const RULE_RANK: Record<string, number> = {
  a: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, j: 11, q: 12, k: 13, king: 13,
};

const SUIT_ASCII: Record<string, PatienceSuit> = {
  '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
  S: 'S', H: 'H', D: 'D', C: 'C', s: 'S', h: 'H', d: 'D', c: 'C',
};

const isRed = (card: PatienceCard): boolean => card.suit === 'H' || card.suit === 'D';

export const rankValue = (card: PatienceCard): number => RANK_VALUE[card.rank] ?? 0;

export const cardId = (card: PatienceCard): string =>
  `${card.rank}${card.suit}${card.faceUp ? '' : '.'}`;

export const cardFromId = (id: string): PatienceCard => {
  const faceUp = !id.endsWith('.');
  const body = faceUp ? id : id.slice(0, -1);
  return {
    rank: body.slice(0, -1) as Rank,
    suit: body.slice(-1) as PatienceSuit,
    faceUp,
  };
};

/**
 * The pack this game is played with.
 *
 * `decks` multiplies it and `deck_suits` narrows it, which is how Spider is
 * eight packs of spades.
 */
export function buildPatienceDeck(game: GameDefinition, seed?: number | string): PatienceCard[] {
  const wanted = game.deckSuits
    ? new Set(game.deckSuits.split('').map((letter) => SUIT_ASCII[letter]).filter(Boolean))
    : null;

  const one: PatienceCard[] = buildStandardDeck()
    .map((card: Card) => ({
      rank: card.rank,
      suit: SUIT_ASCII[card.suit as string],
      faceUp: true,
    }))
    .filter((card: PatienceCard) => !wanted || wanted.has(card.suit));

  const deck: PatienceCard[] = [];
  const packs = Math.max(1, game.decks);
  for (let pack = 0; pack < packs; pack += 1) {
    deck.push(...one.map((card) => ({ ...card })));
  }
  // A one-suit Spider needs 8 x 13 cards and `one` holds 13 of them.
  return shuffleCards(deck, seed);
}

// ============================================================================
// Rules
// ============================================================================

/** The rules in force between these two piles - `same_class` may replace them. */
function rulesFor(destination: PatiencePile, source: PatiencePile | null): PileRules {
  const base = destination.rules;
  const sharesClass = source !== null
    && base.class !== undefined
    && source.rules.class === base.class;
  return sharesClass && base.sameClass ? { ...base, ...base.sameClass } : base;
}

function rankAccepts(rule: RankRule | undefined, top: PatienceCard | null, card: PatienceCard): boolean {
  if (!top) return true;
  switch (rule) {
    case undefined:
    case 'any': return true;
    case 'none': return false;
    case 'same': return rankValue(card) === rankValue(top);
    case 'up': return rankValue(card) === rankValue(top) + 1;
    case 'down': return rankValue(card) === rankValue(top) - 1;
    case 'up_down': return Math.abs(rankValue(card) - rankValue(top)) === 1;
    case 'lower': return rankValue(card) < rankValue(top);
    case 'higher': return rankValue(card) > rankValue(top);
    default: {
      const wanted = RULE_RANK[rule];
      return wanted === undefined ? true : rankValue(card) === wanted;
    }
  }
}

function suitAccepts(rule: SuitRule | undefined, top: PatienceCard | null, card: PatienceCard): boolean {
  if (!top) return true;
  switch (rule) {
    case undefined:
    case 'any': return true;
    case 'none': return false;
    case 'same': return card.suit === top.suit;
    case 'diff': return card.suit !== top.suit;
    case 'same_color': return isRed(card) === isRed(top);
    case 'diff_color': return isRed(card) !== isRed(top);
    case 'red': return isRed(card);
    case 'black': return !isRed(card);
    default: {
      const wanted = SUIT_ASCII[rule];
      return wanted === undefined ? true : card.suit === wanted;
    }
  }
}

/** What an EMPTY pile will take. */
function emptyAccepts(rule: RankRule | undefined, card: PatienceCard): boolean {
  switch (rule) {
    case undefined:
    case 'any': return true;
    case 'none': return false;
    default: {
      const wanted = RULE_RANK[rule];
      return wanted === undefined ? true : rankValue(card) === wanted;
    }
  }
}

// ============================================================================
// Engine
// ============================================================================

export class PatienceEngine {
  public state: PatienceState;
  private readonly game: GameDefinition;

  constructor(game: GameDefinition, options: { seed?: number | string } = {}) {
    this.game = game;
    const deck = buildPatienceDeck(game, options.seed);

    const piles: PatiencePile[] = game.piles.map((definition) => ({
      id: `${definition.type}:${definition.index}`,
      type: definition.type,
      index: definition.index,
      x: definition.x,
      y: definition.y,
      cards: [],
      rules: definition,
    }));

    // Deal in the order the file lists the piles, which is the order csol
    // deals them; `rest` takes whatever is left when its turn comes.
    for (const pile of piles) {
      const wanted = pile.rules.deal;
      if (wanted === 'rest') {
        pile.cards.push(...deck.splice(0, deck.length));
      } else {
        pile.cards.push(...deck.splice(0, Math.min(wanted, deck.length)));
      }
      this.applyHiding(pile);
    }

    this.state = {
      name: game.name,
      title: game.title,
      piles,
      redeals: 0,
      moves: 0,
      won: false,
    };
  }

  /**
   * `hide N` turns the first N face down; `hide -N` leaves only the last N
   * face up, which is how Klondike deals its staircase.
   */
  private applyHiding(pile: PatiencePile): void {
    const hide = pile.rules.hide ?? 0;
    if (hide === 0) {
      // A stock is face down by nature; everything else is dealt face up.
      const faceUp = pile.type !== 'stock';
      for (const card of pile.cards) card.faceUp = faceUp;
      return;
    }
    const count = hide < 0 ? Math.max(0, pile.cards.length + hide) : Math.min(hide, pile.cards.length);
    pile.cards.forEach((card, index) => { card.faceUp = index >= count; });
  }

  // --------------------------------------------------------------------
  // Reading
  // --------------------------------------------------------------------

  public pile(id: string): PatiencePile | undefined {
    return this.state.piles.find((p) => p.id === id);
  }

  /** The first pile of a type - `stock`, `waste`, where a game has only one. */
  public pileOfType(type: PileType): PatiencePile | undefined {
    return this.state.piles.find((pile) => pile.type === type);
  }

  public top(id: string): PatienceCard | undefined {
    const pile = this.pile(id);
    return pile?.cards[pile.cards.length - 1];
  }

  /**
   * How many cards may leave this pile at once, counting from the top.
   *
   * `one` is the top card; `all` the whole pile; `any` however many the
   * caller asks for; `group` as many as form a run the destination's
   * `valid_group` rules accept.
   */
  public maxLift(id: string, toId?: string): number {
    const pile = this.pile(id);
    if (!pile || pile.cards.length === 0) return 0;

    /*
     * The limit belongs to the PAIR, not to the source alone. Klondike puts
     * `move_group group` on the tableau itself; Spider puts it inside
     * `same_class`, meaning "a run may travel between two tableaus of this
     * class" - so the rule only exists once you know where the cards are
     * going. Asking the source in isolation reads Spider as one-card-at-a-
     * time, which is not a game anybody can win.
     */
    const destination = toId ? this.pile(toId) : undefined;
    const effective = destination ? rulesFor(destination, pile) : pile.rules;

    const faceUp = pile.cards.filter((card) => card.faceUp).length;
    switch (effective.moveGroup ?? pile.rules.moveGroup) {
      case 'all': return pile.cards.length;
      case 'any': return faceUp;
      case 'group': return faceUp;
      case 'one':
      case undefined:
      default: return Math.min(1, faceUp);
    }
  }

  /** Does this run hold together by the destination's group rules? */
  private groupIsValid(cards: PatienceCard[], rules: PileRules): boolean {
    const group = rules.validGroup;
    if (cards.length <= 1) return true;
    // Without explicit group rules, the pile's own next_* rules describe a
    // run - which is what makes a Klondike column move as a unit.
    const rank = group?.nextRank ?? rules.nextRank;
    const suit = group?.nextSuit ?? rules.nextSuit;
    for (let i = 1; i < cards.length; i += 1) {
      if (!rankAccepts(rank, cards[i - 1], cards[i])) return false;
      if (!suitAccepts(suit, cards[i - 1], cards[i])) return false;
    }
    return true;
  }

  /** May `count` cards move from one pile to the other? */
  public canMove(fromId: string, toId: string, count = 1): boolean {
    const from = this.pile(fromId);
    const to = this.pile(toId);
    if (!from || !to || from === to) return false;
    if (count < 1 || count > from.cards.length) return false;
    if (count > this.maxLift(fromId, toId)) return false;

    const moving = from.cards.slice(from.cards.length - count);
    if (moving.some((card) => !card.faceUp)) return false;

    const rules = rulesFor(to, from);
    if (rules.from && rules.from.length > 0 && !rules.from.includes(from.type)) return false;

    // A cell holds one card and nothing else.
    if (to.type === 'cell' && (to.cards.length > 0 || count !== 1)) return false;

    if (!this.groupIsValid(moving, rules)) return false;

    const head = moving[0];
    const top = to.cards[to.cards.length - 1] ?? null;
    if (!top) return emptyAccepts(rules.firstRank, head);
    if (!top.faceUp) return false;
    return rankAccepts(rules.nextRank, top, head) && suitAccepts(rules.nextSuit, top, head);
  }

  /** Every pile `count` cards from here could legally go to. */
  public destinationsFor(fromId: string, count = 1): string[] {
    return this.state.piles
      .filter((pile) => this.canMove(fromId, pile.id, count))
      .map((pile) => pile.id);
  }

  // --------------------------------------------------------------------
  // Moving
  // --------------------------------------------------------------------

  public move(fromId: string, toId: string, count = 1): PatienceResult {
    if (this.state.won) return { success: false, message: 'The game is already out.' };
    if (!this.canMove(fromId, toId, count)) {
      return { success: false, message: 'That card cannot go there.' };
    }

    const from = this.pile(fromId) as PatiencePile;
    const to = this.pile(toId) as PatiencePile;
    const moving = from.cards.splice(from.cards.length - count, count);
    to.cards.push(...moving);

    // The card left behind turns face up, which is the whole reward for
    // clearing a Klondike column down.
    const exposed = from.cards[from.cards.length - 1];
    if (exposed && !exposed.faceUp && from.type !== 'stock') exposed.faceUp = true;

    this.state.moves += 1;
    this.checkWon();
    return { success: true, message: `${count} card${count === 1 ? '' : 's'} moved.` };
  }

  /**
   * Turn the stock.
   *
   * `to` says where the cards go - a waste in Klondike, straight onto the
   * tableaus in Spider - and `turn` how many. An empty stock with a redeal
   * left takes the waste back.
   */
  public turnStock(): PatienceResult {
    const stock = this.state.piles.find((pile) => pile.type === 'stock');
    if (!stock) return { success: false, message: 'This game has no stock.' };

    const rules = stock.rules;
    const turn = Math.max(1, rules.turn ?? 1);
    const targets = rules.to && rules.to.length > 0 ? rules.to : (['waste'] as PileType[]);

    if (stock.cards.length === 0) {
      const waste = this.state.piles.find((pile) => pile.type === 'waste');
      const allowed = rules.redeal ?? (waste ? -1 : 0);
      if (!waste || waste.cards.length === 0) {
        return { success: false, message: 'The stock is empty.' };
      }
      if (allowed >= 0 && this.state.redeals >= allowed) {
        return { success: false, message: 'No redeals left.' };
      }
      stock.cards = waste.cards.splice(0, waste.cards.length).reverse();
      for (const card of stock.cards) card.faceUp = false;
      this.state.redeals += 1;
      return { success: true, message: 'The waste goes back under the stock.' };
    }

    if (targets.includes('tableau')) {
      // Spider: one card onto every tableau, and only when none is empty.
      const tableaus = this.state.piles.filter((pile) => pile.type === 'tableau');
      if (tableaus.some((pile) => pile.cards.length === 0)) {
        return { success: false, message: 'Fill every column before dealing again.' };
      }
      for (const tableau of tableaus) {
        const card = stock.cards.pop();
        if (!card) break;
        card.faceUp = true;
        tableau.cards.push(card);
      }
      this.state.moves += 1;
      return { success: true, message: 'A row is dealt.' };
    }

    const waste = this.state.piles.find((pile) => pile.type === 'waste');
    if (!waste) return { success: false, message: 'This game has nowhere to turn cards.' };
    for (let i = 0; i < turn; i += 1) {
      const card = stock.cards.pop();
      if (!card) break;
      card.faceUp = true;
      waste.cards.push(card);
    }
    this.state.moves += 1;
    return { success: true, message: `${turn} turned.` };
  }

  // --------------------------------------------------------------------
  // Winning
  // --------------------------------------------------------------------

  /**
   * A game is out when every pile that declares a `win_rank` satisfies it,
   * and - for the ordinary case where nothing declares one - when every card
   * has reached a foundation.
   */
  public checkWon(): boolean {
    const declaring = this.state.piles.filter((pile) => pile.rules.winRank !== undefined);

    if (declaring.length > 0) {
      this.state.won = declaring.every((pile) => {
        const rule = pile.rules.winRank as RankRule;
        if (rule === 'empty') return pile.cards.length === 0;
        if (rule === 'none') return true;
        const top = pile.cards[pile.cards.length - 1];
        return Boolean(top) && emptyAccepts(rule, top);
      });
      return this.state.won;
    }

    const foundations = this.state.piles.filter((pile) => pile.type === 'foundation');
    if (foundations.length === 0) return false;
    const elsewhere = this.state.piles
      .filter((pile) => pile.type !== 'foundation')
      .reduce((sum, pile) => sum + pile.cards.length, 0);
    this.state.won = elsewhere === 0;
    return this.state.won;
  }

  // --------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------

  public serialize(): PatienceSnapshot {
    return {
      name: this.state.name,
      piles: this.state.piles.map((pile) => ({ id: pile.id, cards: pile.cards.map(cardId) })),
      redeals: this.state.redeals,
      moves: this.state.moves,
      won: this.state.won,
    };
  }

  public static deserialize(game: GameDefinition, snapshot: PatienceSnapshot): PatienceEngine {
    const engine = new PatienceEngine(game, { seed: 'restored' });
    for (const pile of engine.state.piles) {
      const saved = snapshot.piles.find((entry) => entry.id === pile.id);
      pile.cards = saved ? saved.cards.map(cardFromId) : [];
    }
    engine.state.redeals = snapshot.redeals;
    engine.state.moves = snapshot.moves;
    engine.state.won = snapshot.won;
    return engine;
  }
}
