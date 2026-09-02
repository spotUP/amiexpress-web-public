"use strict";
/**
 * Card Lobby - table flows
 *
 * Creating, joining, observing, leaving and deleting a table: the dialog
 * sequences a player walks through, as opposed to the game rules
 * (GameStateManager) or the widgets (UIManager).
 *
 * They came out of index.ts, which was 2808 lines against this repo's 2000
 * ceiling and carried `// @ts-nocheck` - so nothing here had ever been type
 * checked. The door reaches back through TableFlowHost, which is the whole
 * list of what a table flow is allowed to touch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableFlow = void 0;
const lib_1 = require("../lib");
class TableFlow {
    constructor(host) {
        this.host = host;
    }
    isObserverForTable(table, userId) {
        const seated = table.players.find((player) => player.userId === userId && player.role === 'player');
        if (seated)
            return false;
        return table.observers.some((obs) => obs.userId === userId);
    }
    async createTableFlow() {
        console.log('[CardLobby] createTableFlow() - modalActive:', this.host.modalActive);
        if (this.host.modalActive) {
            console.log('[CardLobby] createTableFlow() BLOCKED by modalActive=true');
            return;
        }
        const enabledGames = lib_1.GAME_CATALOG.filter((game) => game.enabled);
        const gameIndex = await this.host.showListDialog('Select Game', enabledGames.map((game) => `${game.name}`));
        if (gameIndex === null)
            return;
        const game = enabledGames[gameIndex];
        const stakeIndex = await this.host.showListDialog('Select Stakes', game.stakes.map((stake) => `${stake.label} (Buy-in ${stake.buyIn})`));
        if (stakeIndex === null)
            return;
        const maxPlayersStr = await this.host.showPromptDialog('Table Size', `Max players (${game.minPlayers}-${game.maxPlayers})`, String(game.maxPlayers));
        if (maxPlayersStr === null)
            return;
        const maxPlayers = (0, lib_1.safeNumber)(maxPlayersStr);
        if (maxPlayers === null || maxPlayers < game.minPlayers || maxPlayers > game.maxPlayers) {
            await this.host.showMessageDialog('Invalid player count.', 'Max players must be within game limits.');
            return;
        }
        const isPrivate = await this.host.showYesNoDialog('Private Table?', 'Create a private table?');
        if (isPrivate === null)
            return;
        const autoStart = await this.host.showYesNoDialog('Auto Start?', 'Auto-start when table is full?');
        if (autoStart === null)
            return;
        await this.finalizeCreateTable(game, stakeIndex, maxPlayers, isPrivate, autoStart);
    }
    async finalizeCreateTable(game, stakeIndex, maxPlayers, isPrivate, autoStart) {
        await this.host.reloadState();
        if (!this.host.lobby || !this.host.currentProfile)
            return;
        const stake = game.stakes[stakeIndex];
        const buyIn = stake.buyIn;
        const entryFee = (0, lib_1.calculateEntryFee)(buyIn);
        if (this.host.currentProfile.wallet.chips < buyIn + entryFee) {
            this.host.pushNotice('Not enough chips for buy-in + entry fee.');
            return;
        }
        this.host.currentProfile.wallet.chips -= buyIn + entryFee;
        this.host.currentProfile.wallet.lifetimeSpent += entryFee;
        const tableId = this.host.lobby.lastTableId + 1;
        this.host.lobby.lastTableId = tableId;
        const table = {
            id: tableId,
            gameId: game.id,
            gameName: game.name,
            stakesLabel: stake.label,
            smallBlind: stake.smallBlind,
            bigBlind: stake.bigBlind,
            buyIn,
            entryFee,
            minPlayers: game.minPlayers,
            maxPlayers,
            status: 'open',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            hostUserId: this.host.currentProfile.userId,
            autoStart,
            isPrivate,
            inviteCode: isPrivate ? String(Math.floor(Math.random() * 9000) + 1000) : undefined,
            players: [],
            observers: [],
        };
        table.players.push({
            userId: this.host.currentProfile.userId,
            username: this.host.currentProfile.username,
            seat: 0,
            stack: buyIn,
            buyIn,
            role: 'player',
            joinedAt: Date.now(),
            isBot: false,
        });
        this.host.syncBotsForTable(table);
        this.host.updateTableStatus(table);
        if (table.status === 'in-progress') {
            this.host.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
        }
        this.host.currentProfile.status = 'table';
        this.host.currentProfile.currentTableId = tableId;
        this.host.lobby.tables.unshift(table);
        this.host.pushEvent(`Table #${table.id} opened: ${table.gameName} ${table.stakesLabel}`);
        this.host.emitLiveChat(`TABLE OPEN: ${table.gameName} ${table.stakesLabel} (#${table.id}) - /JOIN ${table.id}`);
        await this.host.persistState();
        this.host.selectedTableId = table.id;
        this.host.applyViewMode('table');
        this.host.updateAllPanels();
    }
    async joinSelectedTable() {
        console.log('[joinSelectedTable] Called', {
            modalActive: this.host.modalActive,
            lobby: !!this.host.lobby,
            currentProfile: !!this.host.currentProfile,
            selectedTableId: this.host.selectedTableId,
            viewMode: this.host.viewMode
        });
        if (this.host.modalActive || !this.host.lobby || !this.host.currentProfile) {
            console.log('[joinSelectedTable] Early return:', { modalActive: this.host.modalActive, lobby: !!this.host.lobby, currentProfile: !!this.host.currentProfile });
            return;
        }
        if (!this.host.selectedTableId) {
            this.host.pushNotice('Select a table first.');
            console.log('[joinSelectedTable] No table selected');
            return;
        }
        await this.host.reloadState();
        if (!this.host.lobby)
            return;
        const table = this.host.findTableById(this.host.selectedTableId);
        if (!table) {
            this.host.pushNotice('Table not found.');
            return;
        }
        if (this.host.currentProfile.currentTableId && this.host.currentProfile.currentTableId !== table.id) {
            this.host.pushNotice('Leave your current table first.');
            return;
        }
        if (this.host.getOpenHumanSeats(table) <= 0) {
            this.host.pushNotice('Table is full of players.');
            return;
        }
        const buyIn = table.buyIn;
        const entryFee = table.entryFee;
        if (this.host.currentProfile.wallet.chips < buyIn + entryFee) {
            this.host.pushNotice('Not enough chips for buy-in + entry fee.');
            return;
        }
        const existingSeat = table.players.find((player) => player.userId === this.host.currentProfile?.userId && player.role === 'player');
        if (existingSeat) {
            this.host.currentProfile.currentTableId = table.id;
            this.host.currentProfile.status = 'table';
            this.host.applyViewMode('table');
            this.host.updateAllPanels();
            return;
        }
        const seat = this.findSeatForHuman(table);
        if (seat === null) {
            this.host.pushNotice('No seat available.');
            return;
        }
        table.players = table.players.filter((player) => !(player.seat === seat && (0, lib_1.isBotPlayer)(player)));
        this.host.currentProfile.wallet.chips -= buyIn + entryFee;
        this.host.currentProfile.wallet.lifetimeSpent += entryFee;
        table.players.push({
            userId: this.host.currentProfile.userId,
            username: this.host.currentProfile.username,
            seat,
            stack: buyIn,
            buyIn,
            role: 'player',
            joinedAt: Date.now(),
            isBot: false,
        });
        table.observers = table.observers.filter((observer) => observer.userId !== this.host.currentProfile?.userId);
        table.updatedAt = Date.now();
        this.host.currentProfile.status = 'table';
        this.host.currentProfile.currentTableId = table.id;
        const previousStatus = table.status;
        this.host.syncBotsForTable(table);
        this.host.updateTableStatus(table);
        if (previousStatus !== 'in-progress' && table.status === 'in-progress') {
            this.host.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
        }
        this.host.pushEvent(`${this.host.currentProfile.username} joined table #${table.id}`);
        await this.host.persistState();
        this.host.applyViewMode('table');
        this.host.updateAllPanels();
    }
    /**
     * Join a table by ID (used by browser mode)
     */
    async joinTable(tableId) {
        this.host.selectedTableId = tableId;
        await this.joinSelectedTable();
    }
    async observeSelectedTable() {
        if (this.host.modalActive || !this.host.lobby || !this.host.currentProfile)
            return;
        if (!this.host.selectedTableId) {
            this.host.pushNotice('Select a table first.');
            return;
        }
        await this.host.reloadState();
        if (!this.host.lobby)
            return;
        const table = this.host.findTableById(this.host.selectedTableId);
        if (!table) {
            this.host.pushNotice('Table not found.');
            return;
        }
        const seated = table.players.find((player) => player.userId === this.host.currentProfile?.userId && player.role === 'player');
        if (seated) {
            this.host.currentProfile.currentTableId = table.id;
            this.host.currentProfile.status = 'table';
            this.host.applyViewMode('table');
            this.host.updateAllPanels();
            return;
        }
        const alreadyObserver = table.observers.find((obs) => obs.userId === this.host.currentProfile?.userId);
        if (!alreadyObserver) {
            table.observers.push({
                userId: this.host.currentProfile.userId,
                username: this.host.currentProfile.username,
                joinedAt: Date.now(),
            });
        }
        this.host.currentProfile.status = 'table';
        this.host.currentProfile.currentTableId = table.id;
        this.host.pushEvent(`${this.host.currentProfile.username} is observing table #${table.id}`);
        await this.host.persistState();
        this.host.applyViewMode('table');
        this.host.updateAllPanels();
    }
    findSeatForHuman(table) {
        const humanSeats = new Set(this.host.getHumanPlayers(table).map((player) => player.seat));
        for (let seat = 0; seat < table.maxPlayers; seat += 1) {
            if (!humanSeats.has(seat))
                return seat;
        }
        return null;
    }
    async leaveCurrentTable() {
        if (!this.host.currentProfile || !this.host.lobby)
            return;
        const tableId = this.host.currentProfile.currentTableId;
        if (!tableId) {
            this.host.pushNotice('You are not at a table.');
            return;
        }
        await this.host.reloadState();
        if (!this.host.lobby)
            return;
        const table = this.host.findTableById(tableId);
        if (!table) {
            this.host.currentProfile.currentTableId = undefined;
            this.host.currentProfile.status = 'lobby';
            this.host.applyViewMode('lobby');
            await this.host.persistState();
            this.host.updateAllPanels();
            return;
        }
        const playerIndex = table.players.findIndex((player) => player.userId === this.host.currentProfile?.userId && player.role === 'player');
        if (playerIndex >= 0 && table.hand) {
            this.host.pushNotice('Hand in progress. Wait for it to finish before leaving.');
            return;
        }
        if (playerIndex >= 0) {
            const player = table.players[playerIndex];
            const net = player.stack - player.buyIn;
            this.host.currentProfile.wallet.chips += player.stack;
            if (net > 0)
                this.host.currentProfile.wallet.lifetimeEarned += net;
            if (net < 0)
                this.host.currentProfile.wallet.lifetimeSpent += Math.abs(net);
            table.players.splice(playerIndex, 1);
        }
        const observerIndex = table.observers.findIndex((obs) => obs.userId === this.host.currentProfile?.userId);
        if (observerIndex >= 0) {
            table.observers.splice(observerIndex, 1);
        }
        this.host.currentProfile.status = 'lobby';
        this.host.currentProfile.currentTableId = undefined;
        table.updatedAt = Date.now();
        const remainingHumans = this.host.getHumanPlayers(table);
        if (remainingHumans.length === 0) {
            this.host.lobby.tables = this.host.lobby.tables.filter((item) => item.id !== table.id);
            this.host.pushEvent(`Table #${table.id} closed.`);
        }
        else {
            this.host.syncBotsForTable(table);
            if (table.hostUserId === this.host.currentProfile.userId && remainingHumans[0]) {
                table.hostUserId = remainingHumans[0].userId;
            }
            this.host.updateTableStatus(table);
        }
        await this.host.persistState();
        this.host.applyViewMode('lobby');
        this.host.updateAllPanels();
    }
    deleteTableFlow() {
        if (!this.host.selectedTableId || !this.host.lobby)
            return;
        const table = this.host.lobby.tables.find((t) => t.id === this.host.selectedTableId);
        if (!table)
            return;
        if (table.hostUserId !== this.host.currentProfile?.userId) {
            this.host.pushNotice('Only the table host can delete the table.');
            return;
        }
        void this.host
            .showYesNoDialog('Delete Table', `Delete table #${table.id} (${table.gameName})?`)
            .then(async (confirmed) => {
            if (confirmed && this.host.selectedTableId) {
                await this.deleteTable(this.host.selectedTableId);
            }
        });
    }
    async deleteTable(tableId) {
        if (!this.host.lobby)
            return;
        const table = this.host.lobby.tables.find((t) => t.id === tableId);
        if (!table) {
            this.host.pushNotice('Table not found.');
            return;
        }
        // Remove all players from table
        table.players.forEach((player) => {
            if (!(0, lib_1.isBotPlayer)(player)) {
                const profile = this.host.profiles[player.userId];
                if (profile) {
                    profile.currentTableId = undefined;
                    profile.status = 'lobby';
                }
            }
        });
        // Remove table from lobby
        this.host.lobby.tables = this.host.lobby.tables.filter((t) => t.id !== tableId);
        // If current user was at this table, return to lobby view
        if (this.host.currentProfile?.currentTableId === tableId) {
            this.host.currentProfile.currentTableId = undefined;
            this.host.currentProfile.status = 'lobby';
            this.host.focusLobby();
        }
        this.host.selectedTableId = null;
        await this.host.persistState();
        this.host.updateLobbyPanel();
        this.host.pushEvent(`Table #${tableId} deleted.`);
        this.host.pushNotice(`Table #${tableId} deleted.`);
    }
}
exports.TableFlow = TableFlow;
