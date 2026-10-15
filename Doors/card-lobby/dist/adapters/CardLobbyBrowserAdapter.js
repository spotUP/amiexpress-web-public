"use strict";
/**
 * CardLobbyBrowserAdapter
 *
 * Adapts card-lobby state to SDK MultiplayerLobby browser mode interface
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardLobbyBrowserAdapter = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const lib_1 = require("../lib");
class CardLobbyBrowserAdapter extends blessed_1.EventEmitter {
    constructor(lobby, profiles) {
        super();
        this.lobby = lobby;
        this.profiles = profiles;
    }
    // Required methods (not used in browser mode, but required by interface)
    getState() {
        // Browser mode doesn't use lobby state - returns null
        return null;
    }
    async joinQueue(_mode) {
        throw new Error('Matchmaking not supported in card lobby');
    }
    async createLobby(_mode, _isPrivate) {
        // SDK emits 'browser:create-table' event instead
        // Door handles game/stakes dialogs
        throw new Error('Use browser:create-table event');
    }
    async joinLobby(lobbyId) {
        // Validate join request
        const tableId = Number(lobbyId);
        const table = this.lobby.tables.find(t => t.id === tableId);
        if (!table) {
            throw new Error('Table not found');
        }
        const humanPlayers = table.players.filter(p => !(0, lib_1.isBotPlayer)(p));
        if (humanPlayers.length >= table.maxPlayers) {
            throw new Error('Table is full');
        }
        // Actual join handled by door after validation passes
    }
    async leaveLobby() {
        // Exit browser mode - handled by SDK
    }
    async setReady(_ready) {
        // Not used in browser mode
    }
    async startMatch() {
        // Not used in browser mode
    }
    // Browser mode specific methods
    getTables() {
        return this.lobby.tables.map(table => this.convertToTableEntry(table));
    }
    async refreshTables() {
        // Reload from storage
        const globalStore = new bbs_door_sdk_1.Storage({
            doorName: 'card_lobby',
            global: true,
        });
        const stored = await globalStore.load(lib_1.LOBBY_KEY);
        if (stored) {
            this.lobby = stored;
            this.emit('tables:updated');
        }
    }
    async observeTable(_tableId) {
        // Observe mode not implemented yet
        throw new Error('Observe mode not yet implemented');
    }
    filterTables(_filters) {
        // Filtering handled by SDK (client-side)
        // Could implement server-side filtering here if needed
    }
    // Helper methods
    convertToTableEntry(table) {
        const game = (0, lib_1.getGameById)(table.gameId);
        const humanPlayers = table.players.filter(p => !(0, lib_1.isBotPlayer)(p));
        // Calculate table age
        const ageMs = Date.now() - table.createdAt;
        const ageMins = Math.floor(ageMs / 60000);
        const ageHours = Math.floor(ageMins / 60);
        const ageDays = Math.floor(ageHours / 24);
        let age;
        if (ageDays > 0) {
            age = `${ageDays}d ago`;
        }
        else if (ageHours > 0) {
            age = `${ageHours}h ago`;
        }
        else if (ageMins > 0) {
            age = `${ageMins}m ago`;
        }
        else {
            age = 'Just now';
        }
        // Map TableStatus to SDK status
        let status;
        if (table.status === 'open') {
            status = 'waiting';
        }
        else {
            status = 'in_progress';
        }
        return {
            id: table.id,
            gameId: table.gameId,
            gameName: game?.name || 'Unknown',
            stakes: table.stakesLabel,
            players: humanPlayers.length,
            maxPlayers: table.maxPlayers,
            status,
            hostName: table.hostUserId ? this.profiles[table.hostUserId]?.username : undefined,
            age,
            extra: {
                buyIn: game?.stakes.find(s => s.label === table.stakesLabel)?.buyIn || 0,
            },
        };
    }
    // Update methods for door to call
    updateLobby(lobby) {
        this.lobby = lobby;
        this.emit('tables:updated');
    }
    updateProfiles(profiles) {
        this.profiles = profiles;
        this.emit('tables:updated');
    }
}
exports.CardLobbyBrowserAdapter = CardLobbyBrowserAdapter;
