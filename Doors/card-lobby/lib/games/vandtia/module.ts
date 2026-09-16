/**
 * SKITGUBBE (vändtia) at a lobby table.
 *
 * The rules are in `engine.ts`; this seats people, drives the bots through
 * the SDK's CardGameAI, keeps the position in `table.hand.snapshot` so every
 * node sees the same game, and says who the Skitgubbe was.
 *
 * KEYS, which the panel also prints:
 *   swap    1-3 pick a hand card, 4-6 the table card it changes places with,
 *           X when you are happy with what is face up
 *   playing 1-9/0 or the arrows pick a card, X plays it, C takes the pile
 *
 * Nothing is wagered here: "skitgubbe is a social game, it requires no buy
 * in" (sysop, 2026-09-15).
 */

import type { CardGameAI } from '@amiexpress/bbs-door-sdk';
import { Difficulty, VandtiaActionType } from '@amiexpress/bbs-door-sdk';
import type { LobbyTable, PlayerProfile } from '../../types';
import { isBotPlayer } from '../../utils';
import type { TableGameModule, TableGamePainter, GameHintKind } from '../types';
import { VandtiaEngine, cardId, type VandtiaSnapshot, type VandtiaCard } from './engine';
import { explainRefusal } from '../refusal';
import type { CardAnimator } from '../../../managers/CardAnimator';

/** Plumbing only - no game logic. */
export interface VandtiaHost {
  readonly currentProfile: PlayerProfile | null;
  readonly cardGameAI: CardGameAI | null;
  findTableById(tableId: number): LobbyTable | undefined;
  reloadState(): Promise<void>;
  persistState(): Promise<void>;
  pushNotice(message: string): void;
  pushEvent(message: string): void;
  updateTableStatus(table: LobbyTable): void;
  clearTableHand(table: LobbyTable): void;
  updateAllPanels(): void;
  runAction(action: () => void | Promise<void>): void;
  labelVandtiaButtons(hasGame: boolean, swapping: boolean, canTake: boolean): void;
  /**
   * The frames this game passes through: dealing, and a pile turned away.
   *
   * The animator's OWN type, imported. Describing its shape here instead is
   * how `CardButtonArgs` came to reject options that CardButtons had - a
   * second declaration of the same thing, checked against nothing.
   */
  readonly cardAnimator: CardAnimator;
}

export class VandtiaGameModule implements TableGameModule {
  public readonly ids = ['skitgubbe'] as const;
  public readonly usesPokerEngine = false;
  public readonly hintKind: GameHintKind = 'vandtia';

  /** The card the caller has picked out of whatever they are playing from. */
  public selectedCardIndex: number | null = null;
  /** During the swap: the hand card waiting for a table card to change with. */
  public selectedHandIndex: number | null = null;

  /**
   * WHICH OF THE CALLER'S CARDS the hand panel shows.
   *
   * The upper panel is the middle of the table - the pile and the stock -
   * and stays that way; the lower one is yours, and you have two lots: the
   * cards in your hand and the six in front of you. `V` flips between them
   * ("add V to flip between my hand and my cards on the table. the upper
   * panel shows stack and pile", sysop 2026-09-15), which also answers the
   * complaint it came from: the table cards are not on screen at all until
   * you ask for them, or until they become the cards you are playing.
   */
  public handView: 'hand' | 'table' = 'hand';

  /**
   * ARRANGING THE TWO ROWS BY HAND, while the swap is on.
   *
   * "in the swap card view it would be nice to press enter to hold a card and
   * swap with the arrow keys, swap left right for the cards next to the card
   * and up/down for table vs hand cards etc" (sysop, 2026-09-16).
   *
   * So the swap has a cursor and a held card, which is the same gesture as
   * dragging one: ENTER picks the card under the cursor up, the arrows carry
   * it - sideways along its own row, up or down between the hand and the
   * table - and ENTER puts it down. The number keys still do what they did,
   * because somebody who knows them should not have to learn this.
   */
  public swapCursor: { row: 'hand' | 'table'; index: number } = { row: 'hand', index: 0 };

  /** The card the caller is carrying, if any. */
  public heldCard: { row: 'hand' | 'table'; index: number } | null = null;

  public toggleView(): void {
    /*
     * IT WORKS IN EVERY PHASE, including the swap.
     *
     * It was refused during the swap for a while, because a flip left
     * `handView` on the table cards when play started and the caller was
     * shown the wrong row - "i cant seem to start the game now" (sysop,
     * 2026-09-16). But refusing a key somebody reaches for is its own trap:
     * "i cant switch to game view with V like before". The flip is reset when
     * play starts instead, which fixes the original fault without taking the
     * key away.
     */
    this.handView = this.handView === 'hand' ? 'table' : 'hand';
    this.selectedCardIndex = null;      // the numbers now mean other cards
    this.host.pushNotice(this.handView === 'table'
      ? 'Showing the cards in front of you. V shows your hand.'
      : 'Showing your hand. V shows the cards in front of you.');
    this.host.updateAllPanels();
  }

  constructor(private readonly host: VandtiaHost) {}

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  public load(table: LobbyTable): { engine: VandtiaEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    try {
      const engine = VandtiaEngine.deserialize(table.hand.snapshot as unknown as VandtiaSnapshot);
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      this.host.pushNotice(`Failed to restore Skitgubbe: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private save(
    table: LobbyTable,
    engine: VandtiaEngine,
    beforeStacks: Record<string, number>,
    startedAt?: number,
  ): void {
    table.hand = {
      snapshot: engine.serialize() as any,
      beforeStacks,
      startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    table.updatedAt = Date.now();
  }

  private currentTable(): LobbyTable | null {
    const tableId = this.host.currentProfile?.currentTableId;
    return tableId ? this.host.findTableById(tableId) ?? null : null;
  }

  // ------------------------------------------------------------------
  // Starting
  // ------------------------------------------------------------------

  /** What this caller was dealt, for the door's deal animation. */
  public dealtHand(table: LobbyTable, userId: string): unknown[] {
    return this.load(table)?.engine.playerById(userId)?.hand ?? [];
  }

  public async start(table: LobbyTable): Promise<void> {
    try {
      await this.host.reloadState();
      const fresh = this.host.findTableById(table.id);
      if (!fresh) {
        this.host.pushNotice('Table not found.');
        return;
      }
      if (fresh.hand) {
        this.host.pushNotice('Game already in progress.');
        return;
      }

      const seated = fresh.players.filter((player) => player.role === 'player');
      if (seated.length < 2) {
        this.host.pushNotice('Skitgubbe needs at least two players.');
        return;
      }

      const engine = new VandtiaEngine(
        seated.map((p) => p.userId),
        seated.map((p) => p.username),
        seated.map((p) => isBotPlayer(p)),
      );

      this.selectedCardIndex = null;
      this.selectedHandIndex = null;
      this.save(fresh, engine, {}, Date.now());
      this.host.updateTableStatus(fresh);
      this.host.pushEvent(`Skitgubbe dealt at table #${fresh.id}. Swap, then play.`);
      await this.host.persistState();

      await this.advance(fresh);
    } catch (error) {
      const fresh = this.host.findTableById(table.id);
      if (fresh) {
        this.host.clearTableHand(fresh);
        this.host.updateTableStatus(fresh);
        await this.host.persistState();
      }
      this.host.pushNotice(`Game failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ------------------------------------------------------------------
  // Driving the bots
  // ------------------------------------------------------------------

  public async advance(table: LobbyTable): Promise<void> {
    const loaded = this.load(table);
    if (!loaded) return;
    const { engine, beforeStacks } = loaded;

    // The swap happens all at once: every bot arranges its own table before
    // anybody plays, and a human's swap is what the rest are waiting on.
    if (engine.state.phase === 'swap') {
      for (const player of engine.state.players) {
        if (!player.isBot || player.ready) continue;
        for (let attempt = 0; attempt < 6 && !player.ready; attempt += 1) {
          await this.playBotSwap(engine, player.id);
        }
        // Whatever it thinks of its table, it is not holding the game up.
        if (!player.ready) engine.finishSwap(player.id);
      }
      this.save(table, engine, beforeStacks);
      await this.host.persistState();
      this.host.updateAllPanels();
      // Somebody human has still to arrange their table.
      if ((engine.state.phase as string) !== 'playing') return;
    }

    let guard = 0;
    while (engine.state.phase === 'playing' && guard < 600) {
      guard += 1;
      const currentId = engine.currentPlayerId();
      if (!currentId) break;
      const player = engine.playerById(currentId);

      /*
       * A TURN WITH NO CHOICE IN IT IS TAKEN FOR THE CALLER.
       *
       * "skitgubbe can autopick cards if i cant play any" (sysop,
       * 2026-09-16). When nothing in hand will answer the pile the rules
       * leave exactly one move - "Om en spelare inte kan lägga ett kort,
       * måste denne ta upp hela högen" - so asking the caller to find `C`
       * and press it is asking them to confirm a decision they were never
       * given. The pile is taken and the table plays on.
       *
       * Only when there is NOTHING legal: a blind card always counts as a
       * play (its gamble is the point), and a hand with one legal card is
       * still a choice, because holding it and taking the pile can be the
       * better play.
       */
      if (!player?.isBot) {
        if (this.takePileWhenStuck(engine, currentId)) {
          this.host.pushEvent(engine.state.lastAction);
          continue;
        }
        break;
      }

      const moved = await this.playBotTurn(engine, currentId);
      if (!moved) break;
      this.host.pushEvent(engine.state.lastAction);
    }

    this.save(table, engine, beforeStacks);
    await this.host.persistState();
    this.host.updateAllPanels();

    if (engine.state.phase === 'over') await this.finalize(table, engine);
  }

  private async playBotSwap(engine: VandtiaEngine, playerId: string): Promise<void> {
    // No pause for a swap. It happens behind the other players' hands at a
    // real table and nobody watches it; pausing here only makes the door
    // answer "Please wait for current action to complete" to every key the
    // caller presses while it runs (sysop's screenshot, 2026-09-15).
    const decision = await this.decide(engine, playerId, 0);
    if (decision?.action === VandtiaActionType.SWAP
      && typeof decision.handIndex === 'number' && typeof decision.faceUpIndex === 'number') {
      engine.swap(playerId, decision.handIndex, decision.faceUpIndex);
      return;
    }
    engine.finishSwap(playerId);
  }

  /**
   * Take the pile for a caller who has no legal card, and say so.
   *
   * Returns whether it acted, so the loop knows the turn moved on. The engine
   * decides what is legal; this never second-guesses it.
   */
  private takePileWhenStuck(engine: VandtiaEngine, playerId: string): boolean {
    if (engine.state.phase !== 'playing') return false;
    if (engine.currentPlayerId() !== playerId) return false;
    if (engine.state.pile.length === 0) return false;
    if (engine.legalPlays(playerId).length > 0) return false;

    const result = engine.takePile(playerId);
    if (!result.success) return false;

    this.selectedCardIndex = null;
    this.host.pushNotice('Nothing in your hand answers the pile, so you take it.');
    return true;
  }

  private async playBotTurn(engine: VandtiaEngine, playerId: string): Promise<boolean> {
    const decision = await this.decide(engine, playerId);
    if (decision?.action === VandtiaActionType.TAKE_PILE) {
      return engine.takePile(playerId).success;
    }
    if (typeof decision?.cardIndex === 'number') {
      const result = engine.playCard(playerId, decision.cardIndex);
      if (result.success) return true;
    }

    // Whatever the strategy said, the position has the last word - a bot
    // must never wedge a table.
    const legal = engine.legalPlays(playerId);
    if (legal.length > 0) return engine.playCard(playerId, legal[0]).success;
    if (engine.state.pile.length > 0) return engine.takePile(playerId).success;
    return false;
  }

  /**
   * How long a bot appears to think here.
   *
   * The SDK's default is 0.8-2s, which is right for poker - a bot acts a
   * handful of times a hand. This game runs to hundreds of plays, three
   * quarters of them bots', so the same pause would turn one game into an
   * afternoon. Long enough to watch a card land, short enough to play.
   */
  private static readonly BOT_PACE_MS = 350;

  private async decide(engine: VandtiaEngine, playerId: string, paceMs?: number): Promise<any | null> {
    if (!this.host.cardGameAI?.hasStrategy('vandtia')) return null;
    return this.host.cardGameAI.makeDecision('vandtia', {
      difficulty: Difficulty.MEDIUM,
      playerId,
      engine: engine as any,
      thinkingDelayMs: paceMs ?? VandtiaGameModule.BOT_PACE_MS,
    }) as any;
  }

  // ------------------------------------------------------------------
  // The caller's moves
  // ------------------------------------------------------------------

  /**
   * A number key. Cards 1-3 are the hand and 4-6 the table while swapping;
   * afterwards it simply picks from whatever pile is in play.
   */
  /**
   * The card a second press of the same key would play.
   *
   * Nothing during the swap - there 1-3 picks a hand card and 4-6 the table
   * card it changes places with, so a repeat is half of somebody's move -
   * and nothing while the panel is showing the cards in front of you, which
   * are shown rather than played from.
   */
  public selectedCard(table: LobbyTable): number | null {
    if (this.handView === 'table') return null;
    const loaded = this.load(table);
    if (!loaded || loaded.engine.state.phase === 'swap') return null;
    return this.selectedCardIndex;
  }

  /**
   * The way out of a refused card in this game.
   *
   * Taking the pile is always the answer - it is the rule for a player who
   * cannot go ("Om en spelare inte kan lägga ett kort, måste denne ta upp
   * hela högen") - but which cards WOULD go is worth saying while the pile is
   * still small enough to want.
   */
  public refusalAdvice(table: LobbyTable): string | null {
    const loaded = this.load(table);
    const top = loaded?.engine.topOfPile();
    if (!top) return 'The pile is empty - anything goes.';
    return `Play ${cardId(top)} or higher, a 2, or a 10 - or press C to take the pile.`;
  }

  /**
   * ENTER while arranging: pick the card under the cursor up, or put it down.
   *
   * Returns whether it took the key, so the keyboard can leave ENTER alone in
   * every other phase - there it plays the picked card.
   */
  public toggleHold(): boolean {
    const table = this.currentTable();
    const loaded = table ? this.load(table) : null;
    if (!loaded || loaded.engine.state.phase !== 'swap') return false;

    if (this.heldCard) {
      this.heldCard = null;
      this.host.pushNotice('Put down. ENTER picks a card up, the arrows carry it.');
    } else {
      const card = this.cardAt(loaded.engine, this.swapCursor);
      if (!card) return true;
      this.heldCard = { ...this.swapCursor };
      this.host.pushNotice(`Holding ${cardId(card)}. Arrows to move it, ENTER to put it down.`);
    }
    this.host.updateAllPanels();
    return true;
  }

  /** The card a cursor is over, if there is one. */
  private cardAt(
    engine: VandtiaEngine,
    at: { row: 'hand' | 'table'; index: number },
  ): VandtiaCard | undefined {
    const me = this.host.currentProfile?.userId;
    const player = me ? engine.playerById(me) : undefined;
    if (!player) return undefined;
    return (at.row === 'hand' ? player.hand : player.faceUp)[at.index];
  }

  /**
   * An arrow while arranging: carry the held card, or walk the cursor.
   *
   * Sideways stays in the row and trades places with the neighbour; up and
   * down cross between the hand and the table, which IS the swap this phase
   * exists for. Returns whether it took the key.
   */
  public moveSwap(dx: number, dy: number): boolean {
    const table = this.currentTable();
    const loaded = table ? this.load(table) : null;
    if (!loaded || loaded.engine.state.phase !== 'swap') return false;

    const me = this.host.currentProfile?.userId;
    const player = me ? loaded.engine.playerById(me) : undefined;
    if (!player || !me) return true;

    const rowOf = (row: 'hand' | 'table') => (row === 'hand' ? player.hand : player.faceUp);
    const at = this.heldCard ?? this.swapCursor;
    const target = { row: at.row, index: at.index };

    if (dy !== 0) target.row = at.row === 'hand' ? 'table' : 'hand';
    if (dx !== 0) target.index = at.index + dx;

    // Off the end of a row, or onto a row that is shorter: nothing to do.
    const into = rowOf(target.row);
    if (target.index < 0 || target.index >= into.length) return true;

    if (!this.heldCard) {
      this.swapCursor = target;
      this.host.updateAllPanels();
      return true;
    }

    return this.carryTo(target);
  }

  /**
   * Put the card being carried onto a place, wherever the gesture came from.
   *
   * The arrows work out a neighbour and land here; a mouse drop names the
   * place directly and lands here too. ONE implementation, because "swap this
   * card with that one" is one move however the caller expressed it - and two
   * would drift the first time the rules changed.
   *
   * Across the rows is the game's own swap; along a row is an arrangement.
   * Either way the hold follows the card, so a gesture can carry on.
   */
  public carryTo(target: { row: 'hand' | 'table'; index: number }): boolean {
    const table = this.currentTable();
    const loaded = table ? this.load(table) : null;
    const me = this.host.currentProfile?.userId;
    if (!loaded || !me || loaded.engine.state.phase !== 'swap') return false;

    const from = this.heldCard;
    if (!from) return true;
    if (from.row === target.row && from.index === target.index) return true;

    const result = target.row === from.row
      ? loaded.engine.reorder(me, from.row === 'hand' ? 'hand' : 'faceUp', from.index, target.index)
      : from.row === 'hand'
        ? loaded.engine.swap(me, from.index, target.index)
        : loaded.engine.swap(me, target.index, from.index);

    if (!result.success) {
      this.host.pushNotice(explainRefusal(result.message, null));
      return true;
    }

    this.heldCard = target;
    this.swapCursor = target;
    this.save(table!, loaded.engine, loaded.beforeStacks);
    void this.host.persistState();
    this.host.updateAllPanels();
    return true;
  }

  /**
   * A card picked up with the mouse.
   *
   * The same hold the keyboard sets, so a drag that starts with the mouse can
   * be finished with the arrows and the other way round.
   */
  public grabAt(row: 'hand' | 'table', index: number): void {
    const table = this.currentTable();
    const loaded = table ? this.load(table) : null;
    if (!loaded || loaded.engine.state.phase !== 'swap') return;
    if (!this.cardAt(loaded.engine, { row, index })) return;

    this.heldCard = { row, index };
    this.swapCursor = { row, index };
    this.host.updateAllPanels();
  }

  /** Let go of a card without moving it - a drag that ended over nothing. */
  public releaseHeld(): void {
    if (!this.heldCard) return;
    this.heldCard = null;
    this.host.updateAllPanels();
  }

  /** A card dropped onto a place with the mouse. */
  public dropOn(row: 'hand' | 'table', index: number): void {
    if (!this.heldCard) return;
    this.carryTo({ row, index });
    this.heldCard = null;
    this.host.updateAllPanels();
  }

  public selectCard(index: number): void {
    const table = this.currentTable();
    if (!table) return;
    const loaded = this.load(table);
    if (!loaded) return;

    const userId = this.host.currentProfile?.userId;
    const player = userId ? loaded.engine.playerById(userId) : undefined;
    if (!player || !userId) return;

    if (loaded.engine.state.phase === 'swap') {
      this.handleSwapKey(table, loaded, userId, index);
      return;
    }

    const cards = loaded.engine.cardsInPlay(userId);
    if (index < 0 || index >= cards.length) return;
    this.selectedCardIndex = index;
    this.host.pushNotice(`Selected ${cardId(cards[index])} - press it again, or ENTER, to play.`);
    this.host.updateAllPanels();
  }

  /** 1-3 picks a hand card, 4-6 the face-up card it changes places with. */
  private handleSwapKey(
    table: LobbyTable,
    loaded: { engine: VandtiaEngine; beforeStacks: Record<string, number> },
    userId: string,
    index: number,
  ): void {
    const player = loaded.engine.playerById(userId);
    if (!player) return;

    if (index < 3) {
      if (index >= player.hand.length) return;
      this.selectedHandIndex = index;
      this.host.pushNotice(`${cardId(player.hand[index])} picked - now 4, 5 or 6 for the table card.`);
      this.host.updateAllPanels();
      return;
    }

    const faceUpIndex = index - 3;
    if (faceUpIndex >= player.faceUp.length) return;
    if (this.selectedHandIndex === null) {
      this.host.pushNotice('Pick a hand card first - 1, 2 or 3.');
      return;
    }

    const result = loaded.engine.swap(userId, this.selectedHandIndex, faceUpIndex);
    this.selectedHandIndex = null;
    if (!result.success) {
      this.host.pushNotice(result.message);
      return;
    }
    this.save(table, loaded.engine, loaded.beforeStacks);
    void this.host.persistState();
    this.host.pushNotice(result.message);
    this.host.updateAllPanels();
  }

  public moveSelection(delta: number): void {
    const table = this.currentTable();
    if (!table) return;
    const loaded = this.load(table);
    if (!loaded) return;

    const userId = this.host.currentProfile?.userId;
    if (!userId) return;

    const cards = loaded.engine.state.phase === 'swap'
      ? loaded.engine.playerById(userId)?.hand ?? []
      : loaded.engine.cardsInPlay(userId);
    if (cards.length === 0) return;

    const size = cards.length;
    const current = loaded.engine.state.phase === 'swap' ? this.selectedHandIndex : this.selectedCardIndex;
    let next: number;
    if (current === null) {
      const legal = loaded.engine.legalPlays(userId);
      next = legal.length > 0 && loaded.engine.state.phase !== 'swap'
        ? legal[0]
        : (delta >= 0 ? 0 : size - 1);
    } else {
      next = ((current + delta) % size + size) % size;
    }

    if (loaded.engine.state.phase === 'swap') this.selectedHandIndex = next;
    else this.selectedCardIndex = next;

    this.host.pushNotice(`${cardId(cards[next])} picked.`);
    this.host.updateAllPanels();
  }

  /** X: finish swapping, or play the picked card. */
  public primaryAction(): void {
    const table = this.currentTable();
    if (!table) return;

    this.host.runAction(async () => {
      await this.host.reloadState();
      const fresh = this.host.findTableById(table.id);
      if (!fresh) return;
      const loaded = this.load(fresh);
      if (!loaded) {
        this.host.pushNotice('No game in progress. Press D to deal.');
        return;
      }
      const userId = this.host.currentProfile?.userId;
      if (!userId) return;

      if (loaded.engine.state.phase === 'swap') {
        const result = loaded.engine.finishSwap(userId);
        if (!result.success) {
          this.host.pushNotice(result.message);
          return;
        }
        this.selectedHandIndex = null;
        this.heldCard = null;
        this.swapCursor = { row: 'hand', index: 0 };
        // Play starts on the HAND, whatever the panel was showing while the
        // cards were being arranged.
        this.handView = 'hand';
        this.host.pushEvent(`${this.host.currentProfile?.username ?? 'Someone'} is ready.`);
        this.save(fresh, loaded.engine, loaded.beforeStacks);
        await this.host.persistState();
        await this.advance(fresh);
        return;
      }

      if (loaded.engine.currentPlayerId() !== userId) {
        /*
         * A BOT HOLDS THE TURN, SO PLAY IT - do not just say so.
         *
         * "skitgubbe says not my turn and the game doesnt advance" (sysop,
         * 2026-09-16). The bots are pumped by `advance`, and the only thing
         * that called it was the tail of the caller's own successful play. So
         * any way of arriving at a bot's turn WITHOUT having just played -
         * re-entering the door, a reload, a refresh, a play that was refused,
         * or a rule that hands the turn around differently than it used to -
         * left the table sitting on a bot for ever, answering every keypress
         * with "Not your turn."
         *
         * A table that is waiting on a bot is a table that should be moving.
         */
        const onTurn = loaded.engine.playerById(loaded.engine.currentPlayerId() ?? '');
        if (onTurn?.isBot) {
          await this.advance(fresh);
          return;
        }
        this.host.pushNotice(`Waiting for ${onTurn?.name ?? 'the next player'}.`);
        return;
      }
      if (this.selectedCardIndex === null) {
        const blind = loaded.engine.sourceFor(userId) === 'faceDown';
        this.host.pushNotice(blind
          ? 'Pick one of your face-down cards - you will not know what it is until it lands.'
          : 'Pick a card first - press its number, or use the arrows.');
        return;
      }

      const result = loaded.engine.playCard(userId, this.selectedCardIndex);
      if (!result.success) {
        this.host.pushNotice(explainRefusal(result.message, this.refusalAdvice(fresh)));
        return;
      }
      this.selectedCardIndex = null;
      this.host.pushEvent(result.message);
      this.save(fresh, loaded.engine, loaded.beforeStacks);

      /*
       * A card that turns the pile away is SEEN landing on it first. The pile
       * comes from the engine's own report (`VandtiaResult.burned`) - the
       * door must not rebuild it, or the burn rule would live in two places.
       */
      if (result.burned) {
        await this.host.cardAnimator.burn(
          result.burned.pile.map((card) => ({ kind: 'standard' as const, card: card as never })),
        );
      }
      await this.host.persistState();
      await this.advance(fresh);
    });
  }

  /** C: take the pile, because nothing in your hand will go on it. */
  public secondaryAction(): void {
    const table = this.currentTable();
    if (!table) return;

    this.host.runAction(async () => {
      await this.host.reloadState();
      const fresh = this.host.findTableById(table.id);
      if (!fresh) return;
      const loaded = this.load(fresh);
      if (!loaded) return;
      const userId = this.host.currentProfile?.userId;
      if (!userId) return;

      const result = loaded.engine.takePile(userId);
      if (!result.success) {
        this.host.pushNotice(result.message);
        return;
      }
      this.selectedCardIndex = null;
      this.host.pushEvent(result.message);
      this.save(fresh, loaded.engine, loaded.beforeStacks);
      await this.host.persistState();
      await this.advance(fresh);
    });
  }

  /**
   * The third action button, which this game had nothing for.
   *
   * "we need ui buttons as well for all card game actions" (sysop,
   * 2026-09-16) - the bar showed `-` in two slots while a hand was on, and
   * the two things a caller reaches for that had no button were flipping the
   * lower panel and leaving the table. This is the flip; `secondaryAction`
   * is TAKE and `quitAction` leaves.
   */
  public tertiaryAction(): void {
    this.toggleView();
  }


  public render(painter: TableGamePainter, table: LobbyTable): void {
    painter.renderVandtiaGameView(table);
  }

  /** The board panel changes hands mid-game, and the title says so. */
  public panelTitles(table: LobbyTable): { board?: string; players?: string; hand?: string } {
    const loaded = this.load(table);
    const swapping = loaded?.engine.state.phase === 'swap';
    const meId = this.host.currentProfile?.userId;
    const source = loaded && meId ? loaded.engine.sourceFor(meId) : 'hand';
    /*
     * THE COUNTS GO IN THE TITLE, because the panel is the only place they
     * can survive.
     *
     * "pile and stock doesnt draw" (sysop, 2026-09-16). The pile and stock
     * numbers lived in the panel's TEXT - and drawing the cards hides that
     * text, by design: the widgets cover the fallback. So the moment a card
     * landed, a panel named PILE AND STOCK stopped showing either number,
     * and the stock - which is the clock this game is played against - was
     * invisible for the whole hand.
     *
     * A title is drawn by the frame, not by the widgets, so it is there
     * whether the cards draw or not.
     */
    const counts = loaded
      ? `  ${loaded.engine.state.pile.length} / stock ${loaded.engine.state.stock.length}`
      : '';

    return {
      /*
       * During the SWAP the upper panel is lending itself to the caller's own
       * table cards - there is no pile yet - so it says so, with the keys
       * that pick them. The rest of the time it is the middle of the table.
       */
      board: swapping ? 'Your table cards  4 5 6' : `Pile${counts}`,
      players: 'Players',
      hand: this.handView === 'table' ? 'In front of you'
        : swapping ? 'Your hand  1 2 3'
          : source === 'faceUp' ? 'Your table cards'
            : source === 'faceDown' ? 'Face down' : 'Your hand',
    };
  }

  /**
   * The keys, for the activity panel - which is painted by one writer that
   * runs after `render()`, so a legend written into the widget directly does
   * not survive the frame (lib/games/types.ts).
   */
  public activityLines(table: LobbyTable): string[] {
    const loaded = this.load(table);
    const meId = this.host.currentProfile?.userId;
    if (!loaded || !meId) return [];

    const engine = loaded.engine;
    const state = engine.state;
    const me = engine.playerById(meId);
    if (!me) return ['Observing.'];

    const label = (card: { rank: string; suit: string }): string => `${card.rank}${card.suit}`;

    if (state.phase === 'swap') {
      const picked = this.selectedHandIndex;
      return [
        /*
         * THE WAY OUT COMES FIRST. "i am stuck in this view how do i exit?"
         * (sysop, 2026-09-16) - the legend had grown to five pairs and the
         * panel is about forty columns, so `X ready` and `L leave` were the
         * two that fell off the end. A caller who cannot see how to leave a
         * screen is stuck on it whatever else the line says.
         */
        me.ready
          ? '{cyan-fg}Ready.{/} Waiting for the others...  {cyan-fg}L{/} leave'
          : this.heldCard
            ? '{cyan-fg}X{/} ready  {cyan-fg}ENTER{/} drop  {cyan-fg}Arrows{/} move it'
            : '{cyan-fg}X{/} ready  {cyan-fg}L{/} leave  {cyan-fg}ENTER{/} hold',
        this.heldCard
          ? '{yellow-fg}Holding a card.{/} Arrows carry it between the rows.'
          : 'Or swap with {cyan-fg}1-3{/} then {cyan-fg}4-6{/}, or drag a card.',
        `Hand ${me.hand.map((card, i) =>
          (i === picked ? `{yellow-bg}{black-fg}${i + 1}{/}{/}` : `{green-fg}${i + 1}{/}`)
          + ':' + label(card)).join('  ')}`,
        `Tbl  ${me.faceUp.map((card, i) => `{green-fg}${i + 4}{/}:` + label(card)).join('  ')}`,
      ];
    }

    if (state.phase === 'over') return [];
    if (engine.currentPlayerId() !== meId) return ['Waiting for the other players...'];

    const source = engine.sourceFor(meId);
    const legal = engine.legalPlays(meId);
    const keys = legal.map((i) =>
      i === this.selectedCardIndex ? `{yellow-bg}{black-fg}${i + 1}{/}{/}` : `{green-fg}${i + 1}{/}`).join(' ');
    const top = engine.topOfPile();

    if (source === 'faceDown') {
      return [
        `{cyan-fg}Blind.{/} Pick ${keys} and {cyan-fg}ENTER{/} turns it over`,
        top ? `On the pile: ${label(top)}` : 'The pile is empty - anything goes.',
      ];
    }

    const where = source === 'faceUp' ? ' (your table cards)' : '';
    if (legal.length === 0) {
      return [`{yellow-fg}Nothing will go{/}${where} - {cyan-fg}C{/} takes the pile`];
    }
    return [
      `Pick ${keys}  {cyan-fg}ENTER{/} plays${state.pile.length > 0 ? `  {cyan-fg}C{/} takes pile` : ''}`
      + `  {cyan-fg}V{/} ${this.handView === 'table' ? 'hand' : 'my table'}`,
      top ? `On the pile: ${label(top)}${where}` : `Lead anything${where}`,
    ];
  }

  public updateActionButtons(table: LobbyTable): void {
    const loaded = this.load(table);
    const me = this.host.currentProfile?.userId;
    const swapping = loaded?.engine.state.phase === 'swap';
    const canTake = Boolean(loaded && me && !swapping && loaded.engine.state.pile.length > 0
      && loaded.engine.currentPlayerId() === me);
    this.host.labelVandtiaButtons(Boolean(loaded), Boolean(swapping), canTake);
  }

  // ------------------------------------------------------------------

  /** Social game: the title is the only thing anybody loses. */
  private async finalize(table: LobbyTable, engine: VandtiaEngine): Promise<void> {
    const loserId = engine.state.loserId;
    const loserName = engine.state.players.find((p) => p.id === loserId)?.name ?? 'Nobody';
    this.host.pushEvent(`${loserName} is the Skitgubbe at table #${table.id}!`);

    const me = this.host.currentProfile?.userId;
    if (me && loserId === me) this.host.pushNotice('You are the Skitgubbe. Deal again?');
    else if (me && loserId) this.host.pushNotice(`${loserName} is the Skitgubbe.`);

    table.lastHand = {
      board: engine.state.pile.map(cardId),
      hands: Object.fromEntries(engine.state.players.map((p) => [p.id, p.hand.map(cardId)])),
      pot: 0,
      winners: engine.state.finishedOrder.map((id) => ({
        userId: id,
        username: engine.state.players.find((p) => p.id === id)?.name ?? id,
        amount: 0,
      })),
      playedAt: Date.now(),
    };

    this.host.clearTableHand(table);
    this.host.updateTableStatus(table);
    await this.host.persistState();
    this.host.updateAllPanels();
  }
}
