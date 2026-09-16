/**
 * SKITGUBBE (VÄNDTIA) - the engine.
 *
 * The game the board calls Skitgubbe: also vändtia or finne, and Shithead in
 * English. Not to be confused with the trick-taking Skitgubbe in the folder
 * next door - two different Swedish games share the name, and this is the one
 * the sysop plays (their rules, 2026-09-15).
 *
 *   SETUP. Three cards face down in front of each player, three face up on
 *   top of them, three in hand. Before play you may swap hand cards with
 *   your face-up ones: what is on the table is what you will be left with,
 *   so put your strength there.
 *
 *   PLAY. One pile. Play a card of EQUAL OR HIGHER value than the top one,
 *   or take the whole pile into your hand. Refill to three from the stock
 *   while it lasts.
 *
 *     - a 2 goes on anything, and leaves the pile at its own low value
 *     - a 10 turns the pile away out of the game (the vändtia), and the
 *       player goes again
 *     - a fourth card of the same value in a row does the same
 *
 *   ENDGAME. Hand empty and stock empty: play your three face-up cards. Those
 *   gone: play the face-down ones blind - turn one over, and if it will not
 *   go on the pile you take the pile and it. The last player still holding
 *   cards is the Skitgubbe.
 *
 * Pure rules: no I/O, no timers. `module.ts` seats people and drives bots.
 */

import { buildStandardDeck, shuffleCards, type Card, type Rank } from '@amiexpress/bbs-door-sdk';

export type VandtiaSuit = 'S' | 'H' | 'D' | 'C';

export interface VandtiaCard {
  rank: Rank;
  suit: VandtiaSuit;
}

export type VandtiaPhase = 'swap' | 'playing' | 'over';

/** Where a player's next card comes from, in the order the rules use them. */
export type VandtiaSource = 'hand' | 'faceUp' | 'faceDown';

export interface VandtiaPlayer {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  hand: VandtiaCard[];
  /** The three the table shows. Played once the hand and the stock are gone. */
  faceUp: VandtiaCard[];
  /** The three nobody has seen, played blind and last. */
  faceDown: VandtiaCard[];
  /** Done swapping - play starts when everybody is. */
  ready: boolean;
  /** Out of cards, and safe. */
  out: boolean;
}

export interface VandtiaState {
  phase: VandtiaPhase;
  players: VandtiaPlayer[];
  stock: VandtiaCard[];
  /** The pile in the middle, bottom first. */
  pile: VandtiaCard[];
  /** Turned away by a ten or by four of a kind; out of the game for good. */
  burned: VandtiaCard[];
  currentIndex: number;
  finishedOrder: string[];
  loserId?: string;
  lastAction: string;
}

export interface VandtiaResult {
  success: boolean;
  message: string;
  /**
   * THE PILE AS IT WAS WITH THE CARD ON IT, when that card turned it away.
   *
   * "when i add a card that empties the pile my card is not shown on the pile
   * before emptying" (sysop, 2026-09-16). The card is pushed and the pile is
   * turned away inside ONE call, so the state a caller can render has already
   * lost the card: the vändtia lands and vanishes in the same frame.
   *
   * A move with two moments in it needs both to be observable, so the second
   * one is reported here rather than left for the door to reconstruct. The
   * door must NOT re-derive this by pushing the card onto a copy of the pile:
   * that is a second implementation of the burn rule, and it would drift from
   * this one - which already changed once, the day the ace's run became two.
   */
  burned?: {
    /** Every card that went away, the one just played last. */
    pile: VandtiaCard[];
    /** `ten` for the vändtia itself, `run` for a run of the same rank. */
    reason: 'ten' | 'run';
  };
}

export interface VandtiaSnapshot {
  phase: VandtiaPhase;
  players: Array<{
    id: string; name: string; seat: number; isBot: boolean;
    hand: string[]; faceUp: string[]; faceDown: string[];
    ready: boolean; out: boolean;
  }>;
  stock: string[];
  pile: string[];
  burned: string[];
  currentIndex: number;
  finishedOrder: string[];
  loserId?: string;
  lastAction: string;
}

// ============================================================================
// CARDS
// ============================================================================

/**
 * What a card is worth on the pile.
 *
 * "Tre: Det lägsta kortet... Knekt: Värd 11. Dam: 12. Kung: 13. Ess: Högsta
 * värdet." The two and the ten have powers rather than values, and both are
 * playable on anything; the two's value is the lowest there is, which is the
 * whole point of it ("sänker värdet på högen").
 */
const CARD_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

/** A card that may be played on anything at all. */
export const isWild = (card: VandtiaCard): boolean => card.rank === '2' || card.rank === '10';

/** The vändtia itself: turns the pile away. */
export const burnsThePile = (card: VandtiaCard): boolean => card.rank === '10';

/**
 * A card that hands the turn straight back to whoever played it.
 *
 * The ten does it because it turns the pile away and somebody has to lead the
 * empty pile. The TWO does it as well - "2 can be thrown on anything as well
 * and gives the turn back to me but it does not remove the pile" (sysop,
 * 2026-09-16): it is the board's house reading of "sänker värdet på högen",
 * and it is what makes a two worth holding rather than a card you are stuck
 * with. Neither is the same question as whether the pile burns.
 */
export const playsAgain = (card: VandtiaCard): boolean =>
  card.rank === '10' || card.rank === '2';

/** How many of the same rank on top of the pile turn it away. */
const BURN_RUN: Record<string, number> = {
  // "two aces should also remove the pile and give the turn back to me"
  // (sysop, 2026-09-16). Every other rank needs the usual four in a row.
  A: 2,
};
const DEFAULT_BURN_RUN = 4;

export const cardValue = (card: VandtiaCard): number => CARD_VALUE[card.rank] ?? 0;

export const cardId = (card: VandtiaCard): string => `${card.rank}${card.suit}`;

export const cardFromId = (id: string): VandtiaCard => ({
  rank: id.slice(0, -1) as Rank,
  suit: id.slice(-1) as VandtiaSuit,
});

const SUIT_ASCII: Record<string, VandtiaSuit> = {
  '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
  S: 'S', H: 'H', D: 'D', C: 'C',
};

export const buildVandtiaDeck = (seed?: number | string): VandtiaCard[] =>
  shuffleCards(
    buildStandardDeck().map((c: Card) => ({ rank: c.rank, suit: SUIT_ASCII[c.suit as string] })),
    seed,
  );

/** May this card go on that pile? An empty pile takes anything. */
export const canPlayOn = (card: VandtiaCard, pile: VandtiaCard[]): boolean => {
  const top = pile[pile.length - 1];
  if (!top) return true;
  if (isWild(card)) return true;
  return cardValue(card) >= cardValue(top);
};

// ============================================================================
// ENGINE
// ============================================================================

export class VandtiaEngine {
  public state: VandtiaState;

  constructor(
    playerIds: string[],
    playerNames: string[],
    isBot: boolean[],
    options: { seed?: number | string } = {},
  ) {
    if (playerIds.length < 2) throw new Error('Skitgubbe needs at least two players');

    const deck = buildVandtiaDeck(options.seed);
    const players: VandtiaPlayer[] = playerIds.map((id, index) => ({
      id,
      name: playerNames[index] ?? id,
      seat: index,
      isBot: isBot[index] ?? false,
      hand: [],
      faceUp: [],
      faceDown: [],
      ready: false,
      out: false,
    }));

    // Face down first, then the row that covers them, then the hands - the
    // order it is dealt at a table.
    for (const pile of ['faceDown', 'faceUp', 'hand'] as const) {
      for (let round = 0; round < 3; round += 1) {
        for (const player of players) {
          const dealt = deck.pop();
          if (dealt) player[pile].push(dealt);
        }
      }
    }

    this.state = {
      phase: 'swap',
      players,
      stock: deck,
      pile: [],
      burned: [],
      currentIndex: 0,
      finishedOrder: [],
      lastAction: 'Swap your hand for the cards on the table, then play.',
    };
  }

  // --------------------------------------------------------------------
  // Reading the position
  // --------------------------------------------------------------------

  public currentPlayerId(): string | null {
    if (this.state.phase === 'over') return null;
    return this.state.players[this.state.currentIndex]?.id ?? null;
  }

  public playerById(playerId: string): VandtiaPlayer | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  public topOfPile(): VandtiaCard | undefined {
    return this.state.pile[this.state.pile.length - 1];
  }

  /**
   * Which of a player's three piles they are playing from.
   *
   * "När spelarna har blivit av med sina kort på handen, börjar de spela med
   * korten på bordet. Först spelas de uppåtvända korten, sedan de nedåtvända."
   */
  public sourceFor(playerId: string): VandtiaSource {
    const player = this.playerById(playerId);
    if (!player) return 'hand';
    if (player.hand.length > 0) return 'hand';
    if (player.faceUp.length > 0) return 'faceUp';
    return 'faceDown';
  }

  /** The cards a player would be choosing from right now. */
  public cardsInPlay(playerId: string): VandtiaCard[] {
    const player = this.playerById(playerId);
    if (!player) return [];
    return player[this.sourceFor(playerId)];
  }

  /**
   * Indices that may be played.
   *
   * A face-down card is turned blind, so every one of them is a legal move -
   * whether it FITS is the gamble, and the answer arrives when it lands.
   */
  public legalPlays(playerId: string): number[] {
    if (this.state.phase !== 'playing') return [];
    if (this.currentPlayerId() !== playerId) return [];

    const source = this.sourceFor(playerId);
    const cards = this.cardsInPlay(playerId);
    if (source === 'faceDown') return cards.map((_, index) => index);
    return cards.map((_, index) => index).filter((index) => canPlayOn(cards[index], this.state.pile));
  }

  /** Nothing to play means you take the pile - and there has to BE a pile. */
  public mustTakePile(playerId: string): boolean {
    return this.state.phase === 'playing'
      && this.currentPlayerId() === playerId
      && this.state.pile.length > 0
      && this.legalPlays(playerId).length === 0;
  }

  // --------------------------------------------------------------------
  // The swap
  // --------------------------------------------------------------------

  /** Exchange one hand card for one of your own face-up cards. */
  public swap(playerId: string, handIndex: number, faceUpIndex: number): VandtiaResult {
    if (this.state.phase !== 'swap') return { success: false, message: 'Play has started.' };
    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };
    if (player.ready) return { success: false, message: 'You are already done swapping.' };

    const handCard = player.hand[handIndex];
    const tableCard = player.faceUp[faceUpIndex];
    if (!handCard || !tableCard) return { success: false, message: 'No such card.' };

    player.hand[handIndex] = tableCard;
    player.faceUp[faceUpIndex] = handCard;
    this.state.lastAction = `${player.name} swaps ${cardId(handCard)} onto the table.`;
    return { success: true, message: this.state.lastAction };
  }

  /**
   * Move a card along its own row while arranging.
   *
   * The two rows are a player's own business until the play starts, and
   * shuffling one is not a move in the game - but it is how a caller ARRANGES
   * their cards, which is what the swap phase is for: "swap left right for
   * the cards next to the card" (sysop, 2026-09-16).
   *
   * It lives in the engine rather than in the door because the row it edits
   * is the engine's, and a door reaching into `player.hand` to reorder it
   * would be a second place that decides what a hand is.
   */
  public reorder(
    playerId: string,
    row: 'hand' | 'faceUp',
    from: number,
    to: number,
  ): VandtiaResult {
    if (this.state.phase !== 'swap') return { success: false, message: 'Play has started.' };
    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };
    if (player.ready) return { success: false, message: 'You are already done swapping.' };

    const cards = player[row];
    if (from < 0 || from >= cards.length) return { success: false, message: 'No such card.' };
    if (to < 0 || to >= cards.length) return { success: false, message: 'There is nothing there.' };
    if (from === to) return { success: true, message: this.state.lastAction };

    const moved = cards[from];
    cards[from] = cards[to];
    cards[to] = moved;
    this.state.lastAction = `${player.name} moves ${cardId(moved)}.`;
    return { success: true, message: this.state.lastAction };
  }

  /** Done swapping. Play starts when everybody is. */
  public finishSwap(playerId: string): VandtiaResult {
    if (this.state.phase !== 'swap') return { success: false, message: 'Play has started.' };
    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };

    player.ready = true;
    if (this.state.players.every((p) => p.ready)) {
      this.state.phase = 'playing';
      this.state.currentIndex = 0;
      this.state.lastAction = 'Play begins.';
      // Everybody's hand in order the moment arranging is over - after this
      // point a hand is read, not arranged.
      for (const seated of this.state.players) this.sortHand(seated);
    }
    return { success: true, message: this.state.lastAction };
  }

  // --------------------------------------------------------------------
  // Playing
  // --------------------------------------------------------------------

  /**
   * PLAY SEVERAL CARDS OF THE SAME VALUE AT ONCE.
   *
   * "the user should be able to drop several cards of the same value... and
   * get a new one from the deck so he always have 3 on hand", and it "applies
   * in game as well" (sysop, 2026-09-16). A house rule, and a good one: three
   * sevens are one decision, not three, and holding them back one at a time
   * only slows the hand down.
   *
   * It is the same move as `playCard`, made with more cards, so it is the
   * same code - `playCard` calls this with one index. What that buys is that
   * every rule downstream keeps working without being taught about groups:
   * the vandtia still burns, four of a rank across the pile still burns
   * (and reaches it SOONER, since three at once can complete the run), a
   * two still hands the turn back, and the refill still tops the hand up to
   * three.
   *
   * Every card must be the same rank and every one must be legal on its own.
   * A blind card is played singly - you cannot know what you are holding, so
   * there is no group to choose.
   */
  public playCards(playerId: string, cardIndices: number[]): VandtiaResult {
    if (this.state.phase !== 'playing') return { success: false, message: 'Not playing yet.' };
    if (this.currentPlayerId() !== playerId) return { success: false, message: 'Not your turn.' };

    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };

    const source = this.sourceFor(playerId);
    const from = player[source];

    // Highest index first, so removing one does not move the others.
    const indices = [...new Set(cardIndices)].sort((a, b) => a - b);
    if (indices.length === 0) return { success: false, message: 'No card chosen.' };

    const chosen = indices.map((index) => from[index]);
    if (chosen.some((card) => !card)) return { success: false, message: 'No such card.' };

    if (indices.length > 1) {
      if (source === 'faceDown') {
        return { success: false, message: 'A blind card is turned one at a time.' };
      }
      const rank = chosen[0].rank;
      if (chosen.some((card) => card.rank !== rank)) {
        return { success: false, message: 'Cards played together must be the same value.' };
      }
    }

    if (source !== 'faceDown') {
      const refused = chosen.find((card) => !canPlayOn(card, this.state.pile));
      if (refused) {
        const top = this.topOfPile();
        return {
          success: false,
          message: top
            ? `${cardId(refused)} does not answer ${cardId(top)}.`
            : `${cardId(refused)} cannot be played.`,
        };
      }
    }

    return this.playChosen(player, source, indices, chosen);
  }

  /** One card is a group of one - the same move, the same code. */
  public playCard(playerId: string, cardIndex: number): VandtiaResult {
    return this.playCards(playerId, [cardIndex]);
  }

  /**
   * The move itself, once the cards are known to be playable.
   *
   * Every rule downstream reads the pile rather than the cards that were
   * just added, which is what lets one implementation serve a single card
   * and a group: the vandtia burns because a ten is on the pile, four of a
   * rank burns because the pile ends in four, and the refill tops the hand
   * back up to three however many left it.
   */
  private playChosen(
    player: VandtiaPlayer,
    source: VandtiaSource,
    indices: number[],
    chosen: VandtiaCard[],
  ): VandtiaResult {
    const from = player[source];
    const card = chosen[chosen.length - 1];          // the one that landed last
    const many = chosen.length > 1;
    const said = many
      ? `${chosen.length} x ${card.rank}`
      : cardId(card);

    // Highest first, so removing one does not move the others.
    [...indices].sort((a, b) => b - a).forEach((index) => from.splice(index, 1));

    // A blind card that does not fit: the player takes the pile and the card
    // with it. This is the only way to LOSE a turn by playing one.
    if (source === 'faceDown' && !canPlayOn(card, this.state.pile)) {
      player.hand.push(card, ...this.state.pile);
      this.state.pile = [];
      this.state.lastAction = `${player.name} turns ${cardId(card)} - it does not fit, and picks the pile up.`;
      this.advanceTurn(player);
      return { success: true, message: this.state.lastAction };
    }

    this.state.pile.push(...chosen);
    this.state.lastAction = `${player.name} plays ${said}.`;
    this.refill(player);

    // "Tio: Vänder bort hela högen" - and four of the same value in a row
    // does it too, which a group can complete in one turn. Either way the
    // same player plays again.
    const runBurns = this.topRunBurns();
    if (burnsThePile(card) || runBurns) {
      const burned = this.state.pile.length;
      const run = BURN_RUN[card.rank] ?? DEFAULT_BURN_RUN;
      // Kept before the pile goes, for the door to show the cards landing.
      const turnedAway = [...this.state.pile];
      this.state.burned.push(...this.state.pile);
      this.state.pile = [];
      this.state.lastAction = burnsThePile(card)
        ? `${player.name} plays the vändtia ${said} and turns ${burned} cards away.`
        : `${player.name} makes ${run} of a kind and turns ${burned} cards away.`;

      if (this.retireIfEmpty(player)) {
        this.advanceTurn(player);
      } else {
        this.checkForLoser();
      }
      return {
        success: true,
        message: this.state.lastAction,
        burned: { pile: turnedAway, reason: burnsThePile(card) ? 'ten' : 'run' },
      };
    }

    /*
     * A card that plays again keeps the turn. The pile stays where it is -
     * a two lowers the pile rather than turning it away - so this is NOT the
     * burn branch above, only the same player leading again.
     */
    if (playsAgain(card)) {
      if (this.retireIfEmpty(player)) {
        this.advanceTurn(player);
      } else {
        this.checkForLoser();
        this.state.lastAction = `${player.name} plays ${said} and goes again.`;
      }
      return { success: true, message: this.state.lastAction };
    }

    this.retireIfEmpty(player);
    this.advanceTurn(player);
    return { success: true, message: this.state.lastAction };
  }

  /** "Om en spelare inte kan lägga ett kort, måste denne ta upp hela högen." */
  public takePile(playerId: string): VandtiaResult {
    if (this.state.phase !== 'playing') return { success: false, message: 'Not playing yet.' };
    if (this.currentPlayerId() !== playerId) return { success: false, message: 'Not your turn.' };
    if (this.state.pile.length === 0) return { success: false, message: 'There is no pile to take.' };

    const player = this.playerById(playerId);
    if (!player) return { success: false, message: 'You are not in this game.' };

    const taken = this.state.pile.length;
    player.hand.push(...this.state.pile);
    this.state.pile = [];
    this.state.lastAction = `${player.name} picks up ${taken} card${taken === 1 ? '' : 's'}.`;
    this.advanceTurn(player);
    return { success: true, message: this.state.lastAction };
  }

  // --------------------------------------------------------------------
  // The rules' housekeeping
  // --------------------------------------------------------------------

  /** "drar spelarna upp till tre kort från högen tills den tar slut." */
  private refill(player: VandtiaPlayer): void {
    while (player.hand.length < 3 && this.state.stock.length > 0) {
      player.hand.push(this.state.stock.pop() as VandtiaCard);
    }
    this.sortHand(player);
  }

  /**
   * KEEP A HAND IN THE ORDER THIS GAME IS READ IN.
   *
   * "the cardlobby should autosort hands in the way that makes most sense for
   * the game played" (sysop, 2026-09-16). For vändtia that is by VALUE, low
   * to high: every turn is the question "what have I got that beats the
   * pile", and a sorted hand answers it at a glance.
   *
   * The two wilds go last, together. A 2 and a 10 play on anything, so they
   * are never part of that question - and they are the cards worth keeping
   * track of, which is easier at a fixed end of the hand than wherever their
   * number would put them.
   *
   * It runs on every refill, so a card drawn mid-game lands in its place
   * rather than on the end. NOT during the swap: a caller arranging their own
   * two rows must be able to leave a card where they put it.
   */
  public sortHand(player: VandtiaPlayer): void {
    if (this.state.phase === 'swap') return;
    player.hand.sort((a, b) => {
      const wildA = isWild(a) ? 1 : 0;
      const wildB = isWild(b) ? 1 : 0;
      if (wildA !== wildB) return wildA - wildB;
      return cardValue(a) - cardValue(b);
    });
  }

  /**
   * Does the top of the pile end in a run long enough to turn it away?
   *
   * Four of the same rank does it, as it always has - and TWO ACES do,
   * because the board plays it that way: "two aces should also remove the
   * pile and give the turn back to me" (sysop, 2026-09-16). The length is per
   * RANK (`BURN_RUN`) rather than a special case in the middle of `playCard`,
   * so another rank with its own house rule is one entry in that table.
   */
  private topRunBurns(): boolean {
    const pile = this.state.pile;
    const top = pile[pile.length - 1];
    if (!top) return false;
    const needed = BURN_RUN[top.rank] ?? DEFAULT_BURN_RUN;
    if (pile.length < needed) return false;
    const last = pile.slice(-needed);
    return last.every((card) => card.rank === top.rank);
  }

  /** A player with nothing left anywhere is out, and safe. */
  private retireIfEmpty(player: VandtiaPlayer): boolean {
    if (player.out) return true;
    if (player.hand.length > 0 || player.faceUp.length > 0 || player.faceDown.length > 0) return false;
    player.out = true;
    this.state.finishedOrder.push(player.id);
    this.state.lastAction += ` ${player.name} is out.`;
    return true;
  }

  private advanceTurn(from: VandtiaPlayer): void {
    if (this.checkForLoser()) return;
    const count = this.state.players.length;
    const start = this.state.players.findIndex((p) => p.id === from.id);
    for (let step = 1; step <= count; step += 1) {
      const index = (start + step) % count;
      if (!this.state.players[index].out) {
        this.state.currentIndex = index;
        return;
      }
    }
  }

  /** One player left with cards, and they are the Skitgubbe. */
  private checkForLoser(): boolean {
    if (this.state.phase !== 'playing') return false;
    const holding = this.state.players.filter((p) => !p.out);
    if (holding.length > 1) return false;

    this.state.phase = 'over';
    this.state.loserId = holding[0]?.id;
    this.state.lastAction = holding[0]
      ? `${holding[0].name} is the Skitgubbe!`
      : 'Everybody is out.';
    return true;
  }

  // --------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------

  public serialize(): VandtiaSnapshot {
    const s = this.state;
    return {
      phase: s.phase,
      players: s.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
        hand: p.hand.map(cardId),
        faceUp: p.faceUp.map(cardId),
        faceDown: p.faceDown.map(cardId),
        ready: p.ready,
        out: p.out,
      })),
      stock: s.stock.map(cardId),
      pile: s.pile.map(cardId),
      burned: s.burned.map(cardId),
      currentIndex: s.currentIndex,
      finishedOrder: [...s.finishedOrder],
      loserId: s.loserId,
      lastAction: s.lastAction,
    };
  }

  public static deserialize(snapshot: VandtiaSnapshot): VandtiaEngine {
    const engine = new VandtiaEngine(
      snapshot.players.map((p) => p.id),
      snapshot.players.map((p) => p.name),
      snapshot.players.map((p) => p.isBot),
      { seed: 'restored' },
    );
    engine.state = {
      phase: snapshot.phase,
      players: snapshot.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
        hand: p.hand.map(cardFromId),
        faceUp: p.faceUp.map(cardFromId),
        faceDown: p.faceDown.map(cardFromId),
        ready: p.ready,
        out: p.out,
      })),
      stock: snapshot.stock.map(cardFromId),
      pile: snapshot.pile.map(cardFromId),
      burned: snapshot.burned.map(cardFromId),
      currentIndex: snapshot.currentIndex,
      finishedOrder: [...snapshot.finishedOrder],
      loserId: snapshot.loserId,
      lastAction: snapshot.lastAction,
    };
    return engine;
  }
}
