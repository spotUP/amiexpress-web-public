/**
 * External TetriNET adapter for TetriNetScreen.
 * Bridges TetriNetClient events to opponent updates and field syncing.
 */

import type { TetriNetBoard } from '../core/tetrinet/tetrinet-board';
import { createTetriNetBoard, cloneTetriNetBoard } from '../core/tetrinet/tetrinet-board';
import type { TetriNetGameState } from '../core/tetrinet/tetrinet-engine';
import { applyFieldUpdate, encodeField, encodeFieldDifferential } from './tetrinet-protocol';
import type { TetriNetClient } from './tetrinet-client';
import type { PlayerSlot } from './tetrinet-protocol';

export interface ExternalUpdate {
  playerId: string;
  board: TetriNetBoard;
  level: number;
  alive: boolean;
  hasImmunity: boolean;
}

export type UpdateListener = (update: ExternalUpdate) => void;

export class TetriNetExternalAdapter {
  private listeners: UpdateListener[] = [];
  private opponentBoards: Map<PlayerSlot, TetriNetBoard> = new Map();
  private lastSentBoard: TetriNetBoard | null = null;
  private lastSentLevel: number | null = null;

  constructor(private client: TetriNetClient) {
    this.client.on('field:update', (update: { slot: PlayerSlot; field: string; level: number }) => {
      if (update.slot === this.client.getSlot()) {
        return;
      }

      const previous = this.opponentBoards.get(update.slot);
      const previousGrid = previous ? previous.grid : undefined;
      const grid = applyFieldUpdate(update.field, previousGrid, 12, 22);
      const board = createTetriNetBoard(12, 22);
      board.grid = grid as any;

      this.opponentBoards.set(update.slot, board);

      const player = this.client.getPlayer(update.slot);
      const playerId = player?.name || `slot-${update.slot}`;
      this.emitUpdate({
        playerId,
        board,
        level: update.level ?? 0,
        alive: player?.alive ?? true,
        hasImmunity: false,
      });
    });
  }

  onUpdate(listener: UpdateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  sendUpdate(state: TetriNetGameState): void {
    if (!this.client.getSlot()) {
      return;
    }

    const grid = state.board.grid;
    let encoded = '';
    if (this.lastSentBoard) {
      encoded = encodeFieldDifferential(this.lastSentBoard.grid, grid);
    } else {
      encoded = encodeField(grid);
    }

    if (encoded) {
      this.client.sendField(encoded);
      this.lastSentBoard = cloneTetriNetBoard(state.board);
    }

    if (this.lastSentLevel !== state.level) {
      this.client.sendLevel(state.level);
      this.lastSentLevel = state.level;
    }
  }

  getOpponentBoards(): ExternalUpdate[] {
    const updates: ExternalUpdate[] = [];
    for (const [slot, board] of this.opponentBoards.entries()) {
      const player = this.client.getPlayer(slot);
      updates.push({
        playerId: player?.name || `slot-${slot}`,
        board,
        level: player?.level ?? 0,
        alive: player?.alive ?? true,
        hasImmunity: false,
      });
    }
    return updates;
  }

  getBoardForSlot(slot: PlayerSlot): TetriNetBoard | null {
    return this.opponentBoards.get(slot) || null;
  }

  getSlotForPlayerId(id: string): PlayerSlot | null {
    for (const player of this.client.getPlayers()) {
      if (player.name === id) {
        return player.slot;
      }
    }
    if (id.startsWith('slot-')) {
      const num = parseInt(id.slice(5), 10);
      if (num >= 1 && num <= 6) {
        return num as PlayerSlot;
      }
    }
    return null;
  }

  private emitUpdate(update: ExternalUpdate): void {
    for (const listener of this.listeners) {
      listener(update);
    }
  }
}
