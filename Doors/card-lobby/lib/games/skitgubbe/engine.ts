/**
 * SKITGUBBE - the engine.
 *
 * A Swedish game in two phases, played with a standard pack
 * (https://www.pagat.com/beating/skitgubbe.html, the basic game):
 *
 *   1. TRICKS. Everyone holds three cards. A trick is TWO cards - the leader
 *      and the next player in rotation - and the higher card takes both,
 *      face down. Each player draws after playing, so the hands stay at
 *      three while the stock lasts. Equal cards are a `stunsa`: they stay on
 *      the table, both draw, the same player leads again, and the pile goes
 *      to whoever wins the replay. The LAST card of the stock is turned into
 *      the trump suit and held back by whoever drew it. The phase ends the
 *      moment a player cannot play.
 *
 *   2. SHEDDING. The cards you won in phase one are now the cards you must
 *      get rid of. The trump drawer leads. You beat the card in front of you
 *      with a higher card of the same suit or with any trump; if you cannot
 *      or will not, you take that one card into your hand and the next
 *      player faces the card underneath. When the trick holds one card per
 *      player it is set aside (`avstick`) and whoever played last leads.
 *      Shed everything and you are safe. The last player still holding cards
 *      is the Skitgubbe.
 *
 * The engine is pure: state in, moves applied, no I/O and no timers. The
 * door's registry (lib/games/registry.ts) drives it, the bots ask the SDK's
 * CardGameAI what to do, and the panels read `state`.
 */

import { buildStandardDeck, shuffleCards, type Card, type Rank } from '@amiexpress/bbs-door-sdk';

/** Suits as the engine stores them: one ASCII letter, which the SDK's card renderer accepts. */
export type SkitgubbeSuit = 'S' | 'H' | 'D' | 'C';

export interface SkitgubbeCard {
  rank: Rank;
  suit: SkitgubbeSuit;
}

export type SkitgubbePhase = 'tricks' | 'shedding' | 'over';

export interface SkitgubbePlayer {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  /** Phase one: at most three. Phase two: everything still to be shed. */
  hand: SkitgubbeCard[];
  /** Tricks won in phase one; folded into the hand when phase two starts. */
  won: SkitgubbeCard[];
  /** Phase two only: shed the lot and you are out of it. */
  out: boolean;
}

export interface SkitgubbeState {
  phase: SkitgubbePhase;
  players: SkitgubbePlayer[];
  stock: SkitgubbeCard[];
  /** Known only once the last card of the stock has been drawn. */
  trump?: SkitgubbeSuit;
  /** Held face down by its drawer until phase two begins. */
  trumpCard?: SkitgubbeCard;
  trumpHolderId?: string;
  /** Phase one: who leads this trick. Phase two: who led the current trick. */
  leaderIndex: number;
  /** Whose turn it is. */
  currentIndex: number;
  /**
   * The cards in play. Phase one: the current trick plus any bounced cards
   * still waiting for a winner. Phase two: the trick being built.
   */
  table: SkitgubbeCard[];
  /**
   * Who played each card of `table`, so an unfinished phase-one trick can go
   * back where it came from. Phase two never needs it - a pick-up takes the
   * last card whoever played it - so it may be short or empty there.
   */
  tableOwners: string[];
  /**
   * Phase two: how many players were still in the game when this trick
   * began. The trick is complete when `table.length` reaches it.
   */
  trickPlayers: number;
  /** Phase two, in the order they shed their last card. */
  finishedOrder: string[];
  /** The player left holding cards. */
  loserId?: string;
  lastAction: string;
}

export interface SkitgubbeResult {
  success: boolean;
  message: string;
}

export interface SkitgubbeSnapshot {
  phase: SkitgubbePhase;
  players: Array<{
    id: string;
    name: string;
    seat: number;
    isBot: boolean;
    hand: string[];
    won: string[];
    out: boolean;
  }>;
  stock: string[];
  trump?: SkitgubbeSuit;
  trumpCard?: string;
  trumpHolderId?: string;
  leaderIndex: number;
  currentIndex: number;
  table: string[];
  tableOwners: string[];
  trickPlayers: number;
  finishedOrder: string[];
  loserId?: string;
  lastAction: string;
}

// ============================================================================
// CARDS
// ============================================================================

/** Low to high; the ace is high in this game. */
const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_ASCII: Record<string, SkitgubbeSuit> = {
  '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
  S: 'S', H: 'H', D: 'D', C: 'C',
};

export const SUIT_NAMES: Record<SkitgubbeSuit, string> = {
  S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs',
};

export const rankValue = (card: SkitgubbeCard): number => RANK_ORDER.indexOf(card.rank);

export const cardId = (card: SkitgubbeCard): string => `${card.rank}${card.suit}`;

export const cardFromId = (id: string): SkitgubbeCard => ({
  rank: id.slice(0, -1) as Rank,
  suit: id.slice(-1) as SkitgubbeSuit,
});

/** The SDK's pack, with its suit symbols folded down to the letters we store. */
export const buildSkitgubbeDeck = (seed?: number | string): SkitgubbeCard[] => {
  const deck: SkitgubbeCard[] = buildStandardDeck().map((c: Card) => ({
    rank: c.rank,
    suit: SUIT_ASCII[c.suit as string],
  }));
  return shuffleCards(deck, seed);
};

/**
 * Phase two's only question: does `candidate` beat `target`?
 *
 * "A card may be beaten by a higher card of the same suit, and a non-trump
 * may be beaten by any trump."
 */
export const beats = (
  candidate: SkitgubbeCard,
  target: SkitgubbeCard,
  trump: SkitgubbeSuit | undefined,
): boolean => {
  if (candidate.suit === target.suit) return rankValue(candidate) > rankValue(target);
  return trump !== undefined && candidate.suit === trump && target.suit !== trump;
};

// ============================================================================
// ENGINE
// ============================================================================

export class SkitgubbeEngine {
  public state: SkitgubbeState;

  constructor(
    playerIds: string[],
    playerNames: string[],
    isBot: boolean[],
    options: { seed?: number | string } = {},
  ) {
    if (playerIds.length < 2) throw new Error('Skitgubbe needs at least two players');

    const deck = buildSkitgubbeDeck(options.seed);
    const players: SkitgubbePlayer[] = playerIds.map((id, index) => ({
      id,
      name: playerNames[index] ?? id,
      seat: index,
      isBot: isBot[index] ?? false,
      hand: [],
      won: [],
      out: false,
    }));

    // Three each, one at a time, the way it is dealt at a table.
    for (let round = 0; round < 3; round += 1) {
      for (const player of players) {
        const dealt = deck.pop();
        if (dealt) player.hand.push(dealt);
      }
    }

    this.state = {
      phase: 'tricks',
      players,
      stock: deck,
      leaderIndex: 0,
      currentIndex: 0,
      table: [],
      tableOwners: [],
      trickPlayers: players.length,
      finishedOrder: [],
      lastAction: 'Cards are dealt.',
    };
  }

  // --------------------------------------------------------------------
  // Reading the position
  // --------------------------------------------------------------------

  public currentPlayerId(): string | null {
    if (this.state.phase === 'over') return null;
    return this.state.players[this.state.currentIndex]?.id ?? null;
  }

  public playerById(playerId: string): SkitgubbePlayer | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  /** The card the next play has to beat, if there is one. */
  public targetCard(): SkitgubbeCard | undefined {
    return this.state.table[this.state.table.length - 1];
  }

  /**
   * Indices into the player's hand that may be played right now.
   *
   * Phase one has no restriction at all - "the second player may play any
   * card; suits are irrelevant". Phase two allows the leader anything and
   * everyone else only what beats the card in front of them.
   */
  public legalPlays(playerId: string): number[] {
    const player = this.playerById(playerId);
    if (!player || this.state.phase === 'over') return [];
    if (this.currentPlayerId() !== playerId) return [];

    const all = player.hand.map((_, index) => index);
    if (this.state.phase === 'tricks') return all;

    const target = this.targetCard();
    if (!target) return all;
    return all.filter((index) => beats(player.hand[index], target, this.state.trump));
  }

  /** Phase two: may this player take the card in front of them instead of beating it? */
  public canTake(playerId: string): boolean {
    return this.state.phase === 'shedding'
      && this.currentPlayerId() === playerId
      && this.state.table.length > 0;
  }

  // --------------------------------------------------------------------
  // Moves
  // --------------------------------------------------------------------

  public playCard(playerId: string, cardIndex: number): SkitgubbeResult {
    if (this.state.phase === 'over') return { success: false, message: 'The game is over.' };
    if (this.currentPlayerId() !== playerId) return { success: false, message: 'Not your turn.' };

    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };

    const card = player.hand[cardIndex];
    if (!card) return { success: false, message: 'No such card.' };

    if (!this.legalPlays(playerId).includes(cardIndex)) {
      const target = this.targetCard();
      return {
        success: false,
        message: target
          ? `${cardId(card)} does not beat ${cardId(target)}.`
          : `${cardId(card)} cannot be played.`,
      };
    }

    // Whether this card LEADS a trick or ANSWERS one cannot be read off the
    // table: a stunsa leaves bounced cards lying there, so the pile is two
    // cards deep before the replay is even led. The leader's seat is the
    // only honest answer, and it is still current here.
    const isLead = this.state.currentIndex === this.state.leaderIndex;

    player.hand.splice(cardIndex, 1);
    this.state.table.push(card);
    this.state.tableOwners.push(playerId);

    return this.state.phase === 'tricks'
      ? this.afterTrickPlay(player, card, isLead)
      : this.afterSheddingPlay(player, card);
  }

  /**
   * Phase two: "If you cannot or do not wish to beat the card in front of
   * you, you must take it up into your hand."
   */
  public takeCard(playerId: string): SkitgubbeResult {
    if (!this.canTake(playerId)) return { success: false, message: 'There is nothing to take.' };

    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };

    const taken = this.state.table.pop() as SkitgubbeCard;
    this.state.tableOwners.pop();
    player.hand.push(taken);
    this.state.lastAction = `${player.name} picks up ${cardId(taken)}.`;

    if (this.state.table.length === 0) {
      // "If all the cards are picked up, the player to the left of the one
      //  who picked up the last card leads to the next trick."
      this.beginSheddingTrick(this.nextActiveIndex(this.indexOf(playerId)));
    } else {
      this.state.currentIndex = this.nextActiveIndex(this.indexOf(playerId));
    }

    this.checkForLoser();
    return { success: true, message: this.state.lastAction };
  }

  // --------------------------------------------------------------------
  // Phase one
  // --------------------------------------------------------------------

  private afterTrickPlay(player: SkitgubbePlayer, card: SkitgubbeCard, isLead: boolean): SkitgubbeResult {
    this.drawForPlayer(player);
    this.state.lastAction = `${player.name} plays ${cardId(card)}.`;

    if (isLead) {
      // The leader has played; the next player in rotation answers.
      this.state.currentIndex = this.nextIndex(this.state.leaderIndex);
      return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
    }

    const answer = this.state.table[this.state.table.length - 1];
    const led = this.state.table[this.state.table.length - 2];
    const answerer = this.state.players[this.state.currentIndex];

    if (rankValue(answer) === rankValue(led)) {
      // A stunsa: the cards stay, and the same player leads again.
      this.state.lastAction = `Stunsa - ${cardId(led)} and ${cardId(answer)} bounce.`;
      this.state.currentIndex = this.state.leaderIndex;
      return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
    }

    const leader = this.state.players[this.state.leaderIndex];
    const winner = rankValue(answer) > rankValue(led) ? answerer : leader;
    winner.won.push(...this.state.table);
    const taken = this.state.table.length;
    this.state.table = [];
    this.state.tableOwners = [];
    this.state.leaderIndex = this.indexOf(winner.id);
    this.state.currentIndex = this.state.leaderIndex;
    this.state.lastAction = `${winner.name} takes ${taken} card${taken === 1 ? '' : 's'}.`;

    return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
  }

  /**
   * "Each player draws a card from the stock immediately after playing."
   *
   * The last card of the pack is the trump: its drawer keeps it face down
   * rather than adding it to their hand.
   */
  private drawForPlayer(player: SkitgubbePlayer): void {
    const drawn = this.state.stock.pop();
    if (!drawn) return;

    if (this.state.stock.length === 0 && this.state.trump === undefined) {
      this.state.trump = drawn.suit;
      this.state.trumpCard = drawn;
      this.state.trumpHolderId = player.id;
      return;
    }
    player.hand.push(drawn);
  }

  /** Phase one is over "when a player is unable to play". */
  private endPhaseOneIfStuck(): SkitgubbeResult | null {
    if (this.state.phase !== 'tricks') return null;
    if (this.state.players[this.state.currentIndex].hand.length > 0) return null;

    // An unfinished trick goes back to whoever played into it.
    this.state.table.forEach((card, index) => {
      const owner = this.playerById(this.state.tableOwners[index]);
      if (owner) owner.hand.push(card);
    });
    this.state.table = [];
    this.state.tableOwners = [];

    this.beginSheddingPhase();
    return { success: true, message: this.state.lastAction };
  }

  // --------------------------------------------------------------------
  // Phase two
  // --------------------------------------------------------------------

  private beginSheddingPhase(): void {
    for (const player of this.state.players) {
      player.hand.push(...player.won);
      player.won = [];
      if (player.id === this.state.trumpHolderId && this.state.trumpCard) {
        player.hand.push(this.state.trumpCard);
      }
      player.out = player.hand.length === 0;
      if (player.out && !this.state.finishedOrder.includes(player.id)) {
        this.state.finishedOrder.push(player.id);
      }
    }
    this.state.trumpCard = undefined;
    this.state.phase = 'shedding';

    // "The player who drew the trump card leads."
    const holder = this.state.trumpHolderId ? this.indexOf(this.state.trumpHolderId) : this.state.leaderIndex;
    this.beginSheddingTrick(this.state.players[holder]?.out ? this.nextActiveIndex(holder) : holder);
    this.state.lastAction = this.state.trump
      ? `Trumps are ${SUIT_NAMES[this.state.trump]}. Shed your cards.`
      : 'Shed your cards.';
    this.checkForLoser();
  }

  private afterSheddingPlay(player: SkitgubbePlayer, card: SkitgubbeCard): SkitgubbeResult {
    this.state.lastAction = `${player.name} plays ${cardId(card)}.`;

    if (player.hand.length === 0 && !player.out) {
      player.out = true;
      this.state.finishedOrder.push(player.id);
      this.state.lastAction += ` ${player.name} is out.`;
    }

    if (this.state.table.length >= this.state.trickPlayers) {
      // Avstick: the trick is complete and out of the game. "The player who
      // played last (and therefore highest) leads to the next trick" - and
      // if that was their last card, the next player in order leads.
      this.state.table = [];
      this.state.tableOwners = [];
      const playerIndex = this.indexOf(player.id);
      this.beginSheddingTrick(player.out ? this.nextActiveIndex(playerIndex) : playerIndex);
    } else {
      this.state.currentIndex = this.nextActiveIndex(this.indexOf(player.id));
    }

    this.checkForLoser();
    return { success: true, message: this.state.lastAction };
  }

  private beginSheddingTrick(leaderIndex: number): void {
    this.state.leaderIndex = leaderIndex;
    this.state.currentIndex = leaderIndex;
    this.state.trickPlayers = this.activeCount();
  }

  /** One player left holding cards, and they are the skitgubbe. */
  private checkForLoser(): void {
    if (this.state.phase !== 'shedding') return;
    const holding = this.state.players.filter((p) => !p.out && p.hand.length > 0);
    if (holding.length > 1) return;

    this.state.phase = 'over';
    this.state.loserId = holding[0]?.id;
    this.state.lastAction = holding[0]
      ? `${holding[0].name} is the Skitgubbe!`
      : 'Everybody is out.';
  }

  // --------------------------------------------------------------------
  // Rotation
  // --------------------------------------------------------------------

  private indexOf(playerId: string): number {
    return this.state.players.findIndex((p) => p.id === playerId);
  }

  private nextIndex(from: number): number {
    return (from + 1) % this.state.players.length;
  }

  private activeCount(): number {
    return this.state.players.filter((p) => !p.out).length;
  }

  /** The next player still in the game, skipping anyone who has shed everything. */
  private nextActiveIndex(from: number): number {
    const count = this.state.players.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (from + step) % count;
      if (!this.state.players[index].out) return index;
    }
    return from;
  }

  // --------------------------------------------------------------------
  // Persistence - the lobby keeps this in table.hand.snapshot
  // --------------------------------------------------------------------

  public serialize(): SkitgubbeSnapshot {
    const s = this.state;
    return {
      phase: s.phase,
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        isBot: p.isBot,
        hand: p.hand.map(cardId),
        won: p.won.map(cardId),
        out: p.out,
      })),
      stock: s.stock.map(cardId),
      trump: s.trump,
      trumpCard: s.trumpCard ? cardId(s.trumpCard) : undefined,
      trumpHolderId: s.trumpHolderId,
      leaderIndex: s.leaderIndex,
      currentIndex: s.currentIndex,
      table: s.table.map(cardId),
      tableOwners: [...s.tableOwners],
      trickPlayers: s.trickPlayers,
      finishedOrder: [...s.finishedOrder],
      loserId: s.loserId,
      lastAction: s.lastAction,
    };
  }

  public static deserialize(snapshot: SkitgubbeSnapshot): SkitgubbeEngine {
    const engine = new SkitgubbeEngine(
      snapshot.players.map((p) => p.id),
      snapshot.players.map((p) => p.name),
      snapshot.players.map((p) => p.isBot),
      { seed: 'restored' },
    );

    engine.state = {
      phase: snapshot.phase,
      players: snapshot.players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        isBot: p.isBot,
        hand: p.hand.map(cardFromId),
        won: p.won.map(cardFromId),
        out: p.out,
      })),
      stock: snapshot.stock.map(cardFromId),
      trump: snapshot.trump,
      trumpCard: snapshot.trumpCard ? cardFromId(snapshot.trumpCard) : undefined,
      trumpHolderId: snapshot.trumpHolderId,
      leaderIndex: snapshot.leaderIndex,
      currentIndex: snapshot.currentIndex,
      table: snapshot.table.map(cardFromId),
      tableOwners: [...(snapshot.tableOwners ?? [])],
      trickPlayers: snapshot.trickPlayers,
      finishedOrder: [...snapshot.finishedOrder],
      loserId: snapshot.loserId,
      lastAction: snapshot.lastAction,
    };
    return engine;
  }
}
