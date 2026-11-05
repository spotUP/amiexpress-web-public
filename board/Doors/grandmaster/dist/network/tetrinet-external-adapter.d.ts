/**
 * External TetriNET adapter for TetriNetScreen.
 * Bridges TetriNetClient events to opponent updates and field syncing.
 */
import type { TetriNetBoard } from '../core/tetrinet/tetrinet-board';
import type { TetriNetGameState } from '../core/tetrinet/tetrinet-engine';
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
export declare class TetriNetExternalAdapter {
    private client;
    private listeners;
    private opponentBoards;
    private lastSentBoard;
    private lastSentLevel;
    constructor(client: TetriNetClient);
    onUpdate(listener: UpdateListener): () => void;
    sendUpdate(state: TetriNetGameState): void;
    getOpponentBoards(): ExternalUpdate[];
    getBoardForSlot(slot: PlayerSlot): TetriNetBoard | null;
    getSlotForPlayerId(id: string): PlayerSlot | null;
    private emitUpdate;
}
//# sourceMappingURL=tetrinet-external-adapter.d.ts.map