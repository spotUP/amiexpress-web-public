/**
 * WHICH GAME IS THIS TABLE PLAYING?
 *
 * One lookup, asked in the handful of places that used to ask
 * `isUnoTable(table)` and branch. A game the registry does not know is a
 * game the door politely declines to deal, which is what the catalogue's
 * `enabled: false` entries have always meant.
 *
 * Hold'em and UNO are ADAPTERS over the code that already runs them - their
 * engines, their handlers and their painters have not moved - so the risk
 * here is a dispatch change, not a rewrite. Skitgubbe is native
 * (`skitgubbe/module.ts`) and adds no branches anywhere.
 */

import type { LobbyTable } from '../types';
import type { TableGameModule, TableGamePainter, GameHintKind } from './types';

/** The app methods the two legacy adapters call straight through to. */
export interface LegacyGameHost {
  startHoldemHand(table: LobbyTable): Promise<void>;
  startUnoGame(table: LobbyTable): Promise<void>;
  selectUnoCard(index: number): void;
  moveUnoSelection(delta: number): void;
  triggerUnoPlayCard(): void;
  triggerUnoDrawCard(): void;
  triggerUnoCallUno(): void;
  triggerUnoChallenge(): void;
  triggerCall(): void;
  triggerFold(): void;
  triggerRaise(): void;
  updateUnoActionButtons(table: LobbyTable): void;
  updatePokerActionButtons(table: LobbyTable | null): void;
}

/** Texas Hold'em, exactly as it already worked. */
export class HoldemGameModule implements TableGameModule {
  public readonly ids = ['holdem'] as const;
  public readonly usesPokerEngine = true;
  public readonly hintKind: GameHintKind = 'poker';

  constructor(private readonly host: LegacyGameHost) {}

  start(table: LobbyTable): Promise<void> { return this.host.startHoldemHand(table); }
  render(painter: TableGamePainter, table: LobbyTable): void { painter.renderPokerGameView(table); }
  /** Poker has no card selection: the hand plays itself. */
  selectCard(): void { /* nothing to pick */ }
  moveSelection(): void { /* nor anything to walk */ }
  primaryAction(): void { this.host.triggerCall(); }
  secondaryAction(): void { this.host.triggerFold(); }
  tertiaryAction(): void { this.host.triggerRaise(); }
  updateActionButtons(table: LobbyTable): void { this.host.updatePokerActionButtons(table); }
}

/** UNO and its house-rules variant. */
export class UnoGameModule implements TableGameModule {
  public readonly ids = ['uno', 'uno-house'] as const;
  /**
   * NO. `table.hand.snapshot` holds an UnoGameSnapshot, and handing that to
   * `PokerEngine.restore()` is the "cannot restore undefined" notice the
   * sysop hit on every repaint (2026-09-02).
   */
  public readonly usesPokerEngine = false;
  public readonly hintKind: GameHintKind = 'uno';

  constructor(private readonly host: LegacyGameHost) {}

  start(table: LobbyTable): Promise<void> { return this.host.startUnoGame(table); }
  render(painter: TableGamePainter, table: LobbyTable): void { painter.renderUnoGameView(table); }
  selectCard(index: number): void { this.host.selectUnoCard(index); }
  moveSelection(delta: number): void { this.host.moveUnoSelection(delta); }
  primaryAction(): void { this.host.triggerUnoPlayCard(); }
  secondaryAction(): void { this.host.triggerUnoDrawCard(); }
  tertiaryAction(): void { this.host.triggerUnoCallUno(); }
  /** At an UNO table Q is CHALLENGE, not quit. */
  quitAction(): boolean { this.host.triggerUnoChallenge(); return true; }
  updateActionButtons(table: LobbyTable): void { this.host.updateUnoActionButtons(table); }
}

export class GameRegistry {
  private readonly byId = new Map<string, TableGameModule>();

  constructor(modules: TableGameModule[]) {
    for (const module of modules) {
      for (const id of module.ids) this.byId.set(id, module);
    }
  }

  /** The module that serves this table, if the lobby has one. */
  public for(table: Pick<LobbyTable, 'gameId'> | null | undefined): TableGameModule | undefined {
    return table ? this.byId.get(table.gameId) : undefined;
  }

  public get(gameId: string): TableGameModule | undefined {
    return this.byId.get(gameId);
  }

  /**
   * Whether the poker engine may restore this table's hand.
   *
   * The guard that used to read `if (isUnoTable(table)) return null` inside
   * `loadTableHand`, asked of the registry instead - so a game added later
   * cannot forget it by omission: it has to say `usesPokerEngine` out loud.
   */
  public usesPokerEngine(table: Pick<LobbyTable, 'gameId'> | null | undefined): boolean {
    return this.for(table)?.usesPokerEngine ?? false;
  }

  public hintKind(table: Pick<LobbyTable, 'gameId'> | null | undefined): GameHintKind | null {
    return this.for(table)?.hintKind ?? null;
  }
}
