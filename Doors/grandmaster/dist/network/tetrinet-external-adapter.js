"use strict";
/**
 * External TetriNET adapter for TetriNetScreen.
 * Bridges TetriNetClient events to opponent updates and field syncing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetExternalAdapter = void 0;
const tetrinet_board_1 = require("../core/tetrinet/tetrinet-board");
const tetrinet_protocol_1 = require("./tetrinet-protocol");
class TetriNetExternalAdapter {
    constructor(client) {
        this.client = client;
        this.listeners = [];
        this.opponentBoards = new Map();
        this.lastSentBoard = null;
        this.lastSentLevel = null;
        this.client.on('field:update', (update) => {
            if (update.slot === this.client.getSlot()) {
                return;
            }
            const previous = this.opponentBoards.get(update.slot);
            const previousGrid = previous ? previous.grid : undefined;
            const grid = (0, tetrinet_protocol_1.applyFieldUpdate)(update.field, previousGrid, 12, 22);
            const board = (0, tetrinet_board_1.createTetriNetBoard)(12, 22);
            board.grid = grid;
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
    onUpdate(listener) {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }
    sendUpdate(state) {
        if (!this.client.getSlot()) {
            return;
        }
        const grid = state.board.grid;
        let encoded = '';
        if (this.lastSentBoard) {
            encoded = (0, tetrinet_protocol_1.encodeFieldDifferential)(this.lastSentBoard.grid, grid);
        }
        else {
            encoded = (0, tetrinet_protocol_1.encodeField)(grid);
        }
        if (encoded) {
            this.client.sendField(encoded);
            this.lastSentBoard = (0, tetrinet_board_1.cloneTetriNetBoard)(state.board);
        }
        if (this.lastSentLevel !== state.level) {
            this.client.sendLevel(state.level);
            this.lastSentLevel = state.level;
        }
    }
    getOpponentBoards() {
        const updates = [];
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
    getBoardForSlot(slot) {
        return this.opponentBoards.get(slot) || null;
    }
    getSlotForPlayerId(id) {
        for (const player of this.client.getPlayers()) {
            if (player.name === id) {
                return player.slot;
            }
        }
        if (id.startsWith('slot-')) {
            const num = parseInt(id.slice(5), 10);
            if (num >= 1 && num <= 6) {
                return num;
            }
        }
        return null;
    }
    emitUpdate(update) {
        for (const listener of this.listeners) {
            listener(update);
        }
    }
}
exports.TetriNetExternalAdapter = TetriNetExternalAdapter;
//# sourceMappingURL=tetrinet-external-adapter.js.map