/**
 * SKITGUBBE at a lobby table.
 *
 * The rules live in `engine.ts` and know nothing about the door; this is the
 * part that seats people, drives the bots, keeps the game in
 * `table.hand.snapshot` so every node sees the same position, and settles up
 * when somebody is left holding the cards.
 *
 * It implements `TableGameModule`, so index.ts never learns its name: the
 * registry hands the table to whoever serves its `gameId`.
 */

import type { CardGameAI } from '@amiexpress/bbs-door-sdk';
import { Difficulty, SkitgubbeActionType } from '@amiexpress/bbs-door-sdk';
import type { LobbyTable, PlayerProfile, TablePlayer } from '../../types';
import { isBotPlayer } from '../../utils';
import { CHIP_NAME } from '../../constants';
import type { TableGameModule, TableGamePainter, GameHintKind } from '../types';
import { SkitgubbeEngine, cardId, type SkitgubbeSnapshot } from './engine';

/** What the module needs from the door. Plumbing only - no game logic. */
export interface SkitgubbeHost {
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
  /** The seat this profile occupies, or undefined for an observer. */
  seatOf(table: LobbyTable, userId: string): TablePlayer | undefined;
  /** Label the four action buttons for this game (the widgets live in UIManager). */
  labelSkitgubbeButtons(hasGame: boolean, canTake: boolean): void;
}

export class SkitgubbeGameModule implements TableGameModule {
  public readonly ids = ['skitgubbe-tricks'] as const;
  /** Its snapshot is a SkitgubbeSnapshot; the poker engine must not touch it. */
  public readonly usesPokerEngine = false;
  public readonly hintKind: GameHintKind = 'skitgubbe';

  /** The card the caller has picked out of their hand, if any. */
  public selectedCardIndex: number | null = null;

  constructor(private readonly host: SkitgubbeHost) {}

  // ------------------------------------------------------------------
  // State, as the lobby stores it
  // ------------------------------------------------------------------

  public load(table: LobbyTable): { engine: SkitgubbeEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    try {
      const engine = SkitgubbeEngine.deserialize(table.hand.snapshot as unknown as SkitgubbeSnapshot);
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      this.host.pushNotice(`Failed to restore Skitgubbe: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private save(
    table: LobbyTable,
    engine: SkitgubbeEngine,
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

  // ------------------------------------------------------------------
  // Starting
  // ------------------------------------------------------------------

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
      if (seated.length < Math.max(2, fresh.minPlayers)) {
        this.host.pushNotice('Skitgubbe needs at least two players.');
        return;
      }

      const engine = new SkitgubbeEngine(
        seated.map((p) => p.userId),
        seated.map((p) => p.username),
        seated.map((p) => isBotPlayer(p)),
      );

      const beforeStacks: Record<string, number> = {};
      for (const player of seated) {
        if (!isBotPlayer(player)) beforeStacks[player.userId] = player.stack;
      }

      this.selectedCardIndex = null;
      this.save(fresh, engine, beforeStacks, Date.now());
      this.host.updateTableStatus(fresh);
      this.host.pushEvent(`Skitgubbe started at table #${fresh.id}.`);
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
  // Driving the game on
  // ------------------------------------------------------------------

  /**
   * Play out every bot whose turn it is, then stop and let the table be
   * looked at. A guard counts the turns: a rules bug that left nobody able
   * to move would otherwise spin the node rather than show a broken game.
   */
  public async advance(table: LobbyTable): Promise<void> {
    const loaded = this.load(table);
    if (!loaded) return;
    const { engine, beforeStacks } = loaded;

    let guard = 0;
    while (engine.state.phase !== 'over' && guard < 400) {
      guard += 1;
      const currentId = engine.currentPlayerId();
      if (!currentId) break;

      const player = engine.playerById(currentId);
      if (!player?.isBot) break;

      const moved = await this.playBotTurn(engine, currentId);
      if (!moved) break;
      this.host.pushEvent(engine.state.lastAction);
    }

    this.save(table, engine, beforeStacks);
    await this.host.persistState();
    this.host.updateAllPanels();

    if (engine.state.phase === 'over') {
      await this.finalize(table, engine, beforeStacks);
    }
  }

  /** One bot decision, through the SDK's AI if the door gave us one. */
  private async playBotTurn(engine: SkitgubbeEngine, playerId: string): Promise<boolean> {
    const legal = engine.legalPlays(playerId);
    const difficulty = Difficulty.MEDIUM;

    if (this.host.cardGameAI?.hasStrategy('skitgubbe')) {
      const decision: any = await this.host.cardGameAI.makeDecision('skitgubbe', {
        difficulty,
        playerId,
        engine: engine as any,
      });

      if (decision?.action === SkitgubbeActionType.TAKE_CARD && engine.canTake(playerId)) {
        return engine.takeCard(playerId).success;
      }
      if (typeof decision?.cardIndex === 'number') {
        const result = engine.playCard(playerId, decision.cardIndex);
        if (result.success) return true;
      }
    }

    // No strategy registered, or it offered something the position refuses:
    // play the first legal card, or take. A bot must never wedge a table.
    if (legal.length > 0) return engine.playCard(playerId, legal[0]).success;
    if (engine.canTake(playerId)) return engine.takeCard(playerId).success;
    return false;
  }

  // ------------------------------------------------------------------
  // What the caller can do
  // ------------------------------------------------------------------

  private currentTable(): LobbyTable | null {
    const tableId = this.host.currentProfile?.currentTableId;
    return tableId ? this.host.findTableById(tableId) ?? null : null;
  }

  /** The card a second press of the same key - or ENTER - would play. */
  public selectedCard(): number | null {
    return this.selectedCardIndex;
  }

  public selectCard(index: number): void {
    const table = this.currentTable();
    if (!table) return;
    const loaded = this.load(table);
    if (!loaded) return;

    const userId = this.host.currentProfile?.userId;
    const player = userId ? loaded.engine.playerById(userId) : undefined;
    if (!player) return;
    if (index < 0 || index >= player.hand.length) return;

    this.selectedCardIndex = index;
    this.host.pushNotice(`Selected ${cardId(player.hand[index])} - press it again, or ENTER, to play.`);
    this.host.updateAllPanels();
  }

  /**
   * Left/right: walk the hand, wrapping at both ends. Starts at the first
   * card that can legally be played, so the arrow keys are useful before
   * they are precise.
   */
  public moveSelection(delta: number): void {
    const table = this.currentTable();
    if (!table) return;
    const loaded = this.load(table);
    if (!loaded) return;

    const userId = this.host.currentProfile?.userId;
    const player = userId ? loaded.engine.playerById(userId) : undefined;
    if (!player || player.hand.length === 0) return;

    const size = player.hand.length;
    if (this.selectedCardIndex === null) {
      const legal = userId ? loaded.engine.legalPlays(userId) : [];
      this.selectedCardIndex = legal.length > 0 ? legal[0] : (delta >= 0 ? 0 : size - 1);
    } else {
      this.selectedCardIndex = ((this.selectedCardIndex + delta) % size + size) % size;
    }

    this.host.pushNotice(`Selected ${cardId(player.hand[this.selectedCardIndex])} - ENTER plays it.`);
    this.host.updateAllPanels();
  }

  /** X / pad A: play the selected card. */
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
      if (loaded.engine.currentPlayerId() !== userId) {
        this.host.pushNotice('Not your turn.');
        return;
      }
      if (this.selectedCardIndex === null) {
        this.host.pushNotice('Pick a card first - press its number.');
        return;
      }

      const result = loaded.engine.playCard(userId, this.selectedCardIndex);
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

  /** C / pad B: take the card in front of you rather than beating it. */
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
      if (!loaded.engine.canTake(userId)) {
        this.host.pushNotice('There is nothing to take.');
        return;
      }

      const result = loaded.engine.takeCard(userId);
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

  /** Skitgubbe has two moves; there is no third. */
  public tertiaryAction(): void {
    this.host.pushNotice('Skitgubbe: pick a card and press it again - or ENTER - to play it. C takes it.');
  }

  public render(painter: TableGamePainter, table: LobbyTable): void {
    painter.renderSkitgubbeGameView(table);
  }

  public panelTitles(): { board?: string; players?: string; hand?: string } {
    return { board: 'The trick', players: 'Players', hand: 'Your hand' };
  }

  /** DEAL / PLAY and TAKE - the only two moves this game has. */
  public updateActionButtons(table: LobbyTable): void {
    const loaded = this.load(table);
    const me = this.host.currentProfile?.userId;
    const canTake = Boolean(loaded && me && loaded.engine.canTake(me));
    this.host.labelSkitgubbeButtons(Boolean(loaded), canTake);
  }

  // ------------------------------------------------------------------
  // Settling up
  // ------------------------------------------------------------------

  /**
   * One loser, everybody else safe.
   *
   * Skitgubbe is a SOCIAL game and the board's table for it is free: "it
   * requires no buy in" (sysop, 2026-09-15). So when the stake is zero
   * nothing changes hands at all - the result is the whole point, and being
   * the Skitgubbe is the only thing anybody loses. A table created with a
   * stake (the catalogue could offer one later) settles it the way the other
   * games do: the loser pays each survivor.
   */
  private async finalize(
    table: LobbyTable,
    engine: SkitgubbeEngine,
    beforeStacks: Record<string, number>,
  ): Promise<void> {
    const loserId = engine.state.loserId;
    const stake = Math.max(0, table.bigBlind);
    const seated = table.players.filter((player) => player.role === 'player');
    const survivors = seated.filter((player) => player.userId !== loserId);

    if (stake > 0) {
      table.players = table.players.map((player) => {
        if (player.role !== 'player') return player;
        if (player.userId === loserId) {
          return { ...player, stack: Math.max(0, player.stack - stake * survivors.length) };
        }
        return loserId ? { ...player, stack: player.stack + stake } : player;
      });
    }

    const loserName = engine.state.players.find((p) => p.id === loserId)?.name ?? 'Nobody';
    this.host.pushEvent(`${loserName} is the Skitgubbe at table #${table.id}!`);

    const me = this.host.currentProfile?.userId;
    if (me && loserId === me) {
      this.host.pushNotice(stake > 0
        ? `You are the Skitgubbe - ${stake * survivors.length} ${CHIP_NAME} to the table.`
        : 'You are the Skitgubbe. Deal again?');
    } else if (me && loserId) {
      this.host.pushNotice(stake > 0
        ? `${loserName} is the Skitgubbe. You take ${stake} ${CHIP_NAME}.`
        : `${loserName} is the Skitgubbe.`);
    }

    // Keep the finished position on the table for a moment: the panels read
    // `table.hand` and a caller who blinks should still see who lost.
    table.lastHand = {
      board: engine.state.table.map(cardId),
      hands: Object.fromEntries(engine.state.players.map((p) => [p.id, p.hand.map(cardId)])),
      pot: stake * survivors.length,
      winners: survivors.map((player) => ({
        userId: player.userId,
        username: player.username,
        amount: stake,
      })),
      playedAt: Date.now(),
    };

    this.host.clearTableHand(table);
    this.host.updateTableStatus(table);
    await this.host.persistState();
    this.host.updateAllPanels();
  }
}
