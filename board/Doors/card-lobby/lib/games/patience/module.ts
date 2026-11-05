/**
 * PATIENCE at a lobby table.
 *
 * One seat, no bots, no stake - a solitaire is the caller against the pack.
 * The lobby's seat-filling already does the right thing with a one-seat
 * table (it fills `maxPlayers - humans` bots, which is none), so nothing had
 * to be special-cased for it.
 *
 * Every game this module serves comes from a `.game` file under `games/`, so
 * ANOTHER SOLITAIRE IS A TEXT FILE: drop one in, add its catalogue entry, and
 * the door deals it. The module's `ids` are read from that directory at
 * startup rather than listed here, which is what keeps that promise honest.
 *
 * KEYS. A move is two picks: the pile you take from, then the pile it goes
 * to. Numbers name the piles in the order the board prints them, `C` turns
 * the stock, and `X` sends the picked card to a foundation if it will go -
 * the move a player makes a hundred times a game.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LobbyTable, PlayerProfile } from '../../types';
import type { TableGameModule, TableGamePainter, GameHintKind } from '../types';
import { parseGameDefinition, type GameDefinition } from './parser';
import { PatienceEngine, cardId, type PatienceSnapshot, type PatiencePile } from './engine';

/** Plumbing only. */
export interface PatienceHost {
  readonly currentProfile: PlayerProfile | null;
  findTableById(tableId: number): LobbyTable | undefined;
  reloadState(): Promise<void>;
  persistState(): Promise<void>;
  pushNotice(message: string): void;
  pushEvent(message: string): void;
  updateTableStatus(table: LobbyTable): void;
  clearTableHand(table: LobbyTable): void;
  updateAllPanels(): void;
  runAction(action: () => void | Promise<void>): void;
  labelPatienceButtons(hasGame: boolean, canTurn: boolean): void;
}

/** `patience-klondike` and the rest; the prefix keeps them together in the lobby. */
export const PATIENCE_PREFIX = 'patience-';

/**
 * Where the `.game` files live.
 *
 * The door runs from `dist/`, so this walks up until it finds the directory
 * rather than counting `..`s - the count differs between the source tree and
 * the built one, and getting it wrong means a lobby that offers games it
 * cannot deal.
 */
export function findGamesDirectory(start: string = __dirname): string | null {
  let at = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(at, 'games');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        if (fs.readdirSync(candidate).some((name) => name.endsWith('.game'))) return candidate;
      }
    } catch { /* keep walking */ }
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  return null;
}

/** Every definition the door can deal, by catalogue id. */
export function loadGameDefinitions(directory: string | null = findGamesDirectory()):
Map<string, GameDefinition> {
  const games = new Map<string, GameDefinition>();
  if (!directory) return games;

  for (const file of fs.readdirSync(directory).sort()) {
    if (!file.endsWith('.game')) continue;
    try {
      const definition = parseGameDefinition(fs.readFileSync(path.join(directory, file), 'utf8'));
      games.set(`${PATIENCE_PREFIX}${definition.name}`, definition);
    } catch (error) {
      // A broken file must not take the door down with it - the others are
      // still playable, and the reason is worth printing once.
console.warn(`[card-lobby] ${file} could not be read: ${error instanceof Error ? error.message : error}`);
    }
  }
  return games;
}

export class PatienceGameModule implements TableGameModule {
  public readonly ids: readonly string[];
  public readonly usesPokerEngine = false;
  public readonly hintKind: GameHintKind = 'patience';

  /** The pile a move is taking FROM, once the caller has picked one. */
  public selectedPileId: string | null = null;

  private readonly games: Map<string, GameDefinition>;

  constructor(private readonly host: PatienceHost, games = loadGameDefinitions()) {
    this.games = games;
    this.ids = [...games.keys()];
  }

  public definitionFor(table: LobbyTable): GameDefinition | undefined {
    return this.games.get(table.gameId);
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  public load(table: LobbyTable): PatienceEngine | null {
    const definition = this.definitionFor(table);
    if (!definition || !table.hand) return null;
    try {
      return PatienceEngine.deserialize(definition, table.hand.snapshot as unknown as PatienceSnapshot);
    } catch (error) {
      this.host.pushNotice(`Failed to restore the game: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private save(table: LobbyTable, engine: PatienceEngine, startedAt?: number): void {
    table.hand = {
      snapshot: engine.serialize() as any,
      beforeStacks: {},
      startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    table.updatedAt = Date.now();
  }

  private currentTable(): LobbyTable | null {
    const tableId = this.host.currentProfile?.currentTableId;
    return tableId ? this.host.findTableById(tableId) ?? null : null;
  }

  /** The piles as the board prints them, which is what a number key names. */
  public boardOrder(engine: PatienceEngine): PatiencePile[] {
    const order: Record<string, number> = { tableau: 0, waste: 1, cell: 2, foundation: 3, stock: 4 };
    return [...engine.state.piles].sort((a, b) =>
      (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.index - b.index);
  }

  // ------------------------------------------------------------------
  // Playing
  // ------------------------------------------------------------------

  public async start(table: LobbyTable): Promise<void> {
    const definition = this.definitionFor(table);
    if (!definition) {
      this.host.pushNotice(`${table.gameName} has no definition file.`);
      return;
    }

    await this.host.reloadState();
    const fresh = this.host.findTableById(table.id);
    if (!fresh) return;
    if (fresh.hand) {
      this.host.pushNotice('A game is already dealt. L leaves it.');
      return;
    }

    const engine = new PatienceEngine(definition);
    this.selectedPileId = null;
    this.save(fresh, engine, Date.now());
    this.host.updateTableStatus(fresh);
    this.host.pushEvent(`${definition.title} dealt at table #${fresh.id}.`);
    await this.host.persistState();
    this.host.updateAllPanels();
  }

  /**
   * A number key names a pile in board order. The first pick is the pile a
   * card leaves; the second is where it goes.
   */
  public selectCard(index: number): void {
    const table = this.currentTable();
    if (!table) return;
    const engine = this.load(table);
    if (!engine) return;

    const piles = this.boardOrder(engine);
    const pile = piles[index];
    if (!pile) return;

    if (this.selectedPileId === null) {
      if (pile.cards.length === 0) {
        this.host.pushNotice('That pile is empty.');
        return;
      }
      this.selectedPileId = pile.id;
      const top = pile.cards[pile.cards.length - 1];
      this.host.pushNotice(`${top.faceUp ? cardId(top) : 'A face-down card'} picked. Now the pile it goes to.`);
      this.host.updateAllPanels();
      return;
    }

    if (this.selectedPileId === pile.id) {
      this.selectedPileId = null;
      this.host.pushNotice('Pick cancelled.');
      this.host.updateAllPanels();
      return;
    }

    this.moveTo(table, engine, pile.id);
  }

  /**
   * Move as many cards as the rules allow - the longest run that will go,
   * which is what a player means by dragging a column.
   */
  private moveTo(table: LobbyTable, engine: PatienceEngine, toId: string): void {
    const fromId = this.selectedPileId;
    if (!fromId) return;

    const most = engine.maxLift(fromId, toId);
    let moved = false;
    for (let count = most; count >= 1; count -= 1) {
      if (engine.canMove(fromId, toId, count)) {
        const result = engine.move(fromId, toId, count);
        this.host.pushEvent(result.message);
        moved = true;
        break;
      }
    }

    if (!moved) {
      this.host.pushNotice('That card cannot go there.');
      return;
    }

    this.selectedPileId = null;
    this.finish(table, engine);
  }

  private finish(table: LobbyTable, engine: PatienceEngine): void {
    this.save(table, engine);
    if (engine.state.won) {
      this.host.pushEvent(`${engine.state.title} is out in ${engine.state.moves} moves!`);
      this.host.pushNotice('Out! Press D to deal another.');
      table.lastHand = {
        board: [], hands: {}, pot: 0,
        winners: [{
          userId: this.host.currentProfile?.userId ?? '',
          username: this.host.currentProfile?.username ?? 'you',
          amount: 0,
        }],
        playedAt: Date.now(),
      };
      this.host.clearTableHand(table);
      this.host.updateTableStatus(table);
    }
    void this.host.persistState();
    this.host.updateAllPanels();
  }

  /** X: send the picked pile's top card home, if a foundation will take it. */
  public primaryAction(): void {
    const table = this.currentTable();
    if (!table) return;

    this.host.runAction(async () => {
      await this.host.reloadState();
      const fresh = this.host.findTableById(table.id);
      if (!fresh) return;
      const engine = this.load(fresh);
      if (!engine) {
        this.host.pushNotice('No game dealt. Press D to deal.');
        return;
      }

      const sources = this.selectedPileId
        ? [this.selectedPileId]
        : this.boardOrder(engine).filter((pile) => pile.type !== 'foundation').map((pile) => pile.id);

      for (const fromId of sources) {
        const foundation = engine.state.piles
          .find((pile) => pile.type === 'foundation' && engine.canMove(fromId, pile.id, 1));
        if (!foundation) continue;
        engine.move(fromId, foundation.id, 1);
        this.selectedPileId = null;
        this.host.pushEvent(`Home to ${foundation.id}.`);
        this.finish(fresh, engine);
        return;
      }

      this.host.pushNotice('Nothing will go home yet.');
    });
  }

  /** C: turn the stock, or take the waste back under it. */
  public secondaryAction(): void {
    const table = this.currentTable();
    if (!table) return;

    this.host.runAction(async () => {
      await this.host.reloadState();
      const fresh = this.host.findTableById(table.id);
      if (!fresh) return;
      const engine = this.load(fresh);
      if (!engine) return;

      const result = engine.turnStock();
      if (!result.success) {
        this.host.pushNotice(result.message);
        return;
      }
      this.selectedPileId = null;
      this.host.pushEvent(result.message);
      this.finish(fresh, engine);
    });
  }

  public tertiaryAction(): void {
    this.selectedPileId = null;
    this.host.pushNotice('Pick cancelled.');
    this.host.updateAllPanels();
  }

  /** Left and right step the pick along the board. */
  public moveSelection(delta: number): void {
    const table = this.currentTable();
    if (!table) return;
    const engine = this.load(table);
    if (!engine) return;

    const piles = this.boardOrder(engine);
    const at = piles.findIndex((pile) => pile.id === this.selectedPileId);
    const next = at < 0
      ? (delta >= 0 ? 0 : piles.length - 1)
      : ((at + delta) % piles.length + piles.length) % piles.length;
    this.selectedPileId = piles[next]?.id ?? null;
    this.host.updateAllPanels();
  }

  public render(painter: TableGamePainter, table: LobbyTable): void {
    painter.renderPatienceGameView(table);
  }

  /** A solitaire has no players and no hand: it has piles and columns. */
  public panelTitles(table: LobbyTable): { board?: string; players?: string; hand?: string } {
    return {
      board: 'Foundations and stock',
      players: this.definitionFor(table)?.title ?? 'Patience',
      hand: 'Columns',
    };
  }

  public updateActionButtons(table: LobbyTable): void {
    const engine = this.load(table);
    const stock = engine?.pileOfType('stock');
    this.host.labelPatienceButtons(Boolean(engine), Boolean(stock));
  }

  /** The keys, for the panel that keeps them (lib/games/types.ts). */
  public activityLines(table: LobbyTable): string[] {
    const engine = this.load(table);
    if (!engine) return ['{cyan-fg}D{/} deals'];

    const piles = this.boardOrder(engine);
    const picked = piles.findIndex((pile) => pile.id === this.selectedPileId);
    const lines = [
      picked >= 0
        ? `{cyan-fg}From ${picked + 1}{/} - now the number of the pile it goes to`
        : '{cyan-fg}1-9{/} pick a pile  {cyan-fg}X{/} send home  {cyan-fg}C{/} turn stock',
    ];

    if (picked >= 0) {
      const destinations = engine.destinationsFor(this.selectedPileId as string,
        engine.maxLift(this.selectedPileId as string));
      const numbered = destinations
        .map((id) => piles.findIndex((pile) => pile.id === id) + 1)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      lines.push(numbered.length > 0
        ? `Will take it: ${numbered.map((n) => `{green-fg}${n}{/}`).join(' ')}`
        : '{yellow-fg}Nothing will take it{/} - R cancels');
    }

    lines.push(`Moves ${engine.state.moves}`);
    return lines;
  }
}
