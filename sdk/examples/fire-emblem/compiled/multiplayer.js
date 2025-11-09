"use strict";
/**
 * Fire Emblem Multiplayer Mode
 *
 * Competitive and co-op multiplayer modes for Fire Emblem: Emblem of Valor.
 *
 * Modes:
 * - Skirmish: 1v1 tactical battles on preset maps
 * - Team Battle: 2v2 cooperative battles
 * - Co-op Campaign: Play story mode together
 * - Draft Mode: Players take turns picking units
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiplayerManager = exports.MultiplayerMode = void 0;
const index_1 = require("../../core/index");
/**
 * Multiplayer game modes
 */
var MultiplayerMode;
(function (MultiplayerMode) {
    MultiplayerMode["Skirmish"] = "Skirmish";
    MultiplayerMode["TeamBattle"] = "TeamBattle";
    MultiplayerMode["CoopCampaign"] = "CoopCampaign";
    MultiplayerMode["DraftBattle"] = "DraftBattle"; // Draft then battle
})(MultiplayerMode || (exports.MultiplayerMode = MultiplayerMode = {}));
/**
 * Network message types
 */
var MessageType;
(function (MessageType) {
    MessageType["Join"] = "join";
    MessageType["Ready"] = "ready";
    MessageType["Move"] = "move";
    MessageType["Attack"] = "attack";
    MessageType["EndTurn"] = "end_turn";
    MessageType["Draft"] = "draft";
    MessageType["Chat"] = "chat";
    MessageType["Sync"] = "sync";
})(MessageType || (MessageType = {}));
/**
 * Fire Emblem Multiplayer Manager
 */
class MultiplayerManager {
    constructor(door, playerId) {
        this.cursor = { x: 0, y: 0 };
        this.selectedUnit = null;
        // Draft mode
        this.draftPool = [];
        this.draftOrder = [];
        this.currentDraftPick = 0;
        this.door = door;
        this.localPlayerId = playerId;
        this.gfx = new index_1.GraphicsEngine({ width: 80, height: 24 });
        this.network = new index_1.NetworkEngine({ mode: 'turn-based' });
        this.combat = new index_1.TacticalCombatEngine({ gridWidth: 20, gridHeight: 15 });
        this.classes = new index_1.ClassSystem();
        this.matchState = {
            mode: MultiplayerMode.Skirmish,
            players: new Map(),
            currentTurn: '',
            turnCount: 0,
            phase: 'setup'
        };
        this.setupNetworkHandlers();
    }
    /**
     * Setup network message handlers
     */
    setupNetworkHandlers() {
        this.network.on('player:joined', (data) => {
            this.handlePlayerJoined(data.playerId, data.name);
        });
        this.network.on('player:left', (data) => {
            this.handlePlayerLeft(data.playerId);
        });
        this.network.on('message:received', (message) => {
            this.handleNetworkMessage(message);
        });
        this.network.on('connection:lost', () => {
            this.showConnectionError();
        });
    }
    /**
     * Start matchmaking
     */
    async findMatch(mode) {
        this.matchState.mode = mode;
        this.showMatchmaking();
        // Create a matchmaking room
        const roomId = `matchmaking-${Date.now()}`;
        this.network.createRoom(roomId, { maxPlayers: 4 });
        // Broadcast find match request
        this.network.broadcast('find_match', { mode });
    }
    /**
     * Create private lobby
     */
    async createLobby(mode) {
        this.matchState.mode = mode;
        const lobbyCode = this.generateLobbyCode();
        this.network.createRoom(lobbyCode, { maxPlayers: 4 });
        this.showLobby(lobbyCode);
        return lobbyCode;
    }
    /**
     * Join private lobby
     */
    async joinLobby(lobbyCode) {
        this.showConnecting();
        this.network.joinRoom(lobbyCode);
    }
    /**
     * Handle player joined
     */
    handlePlayerJoined(playerId, name) {
        const team = this.matchState.players.size === 0 ? 'player' : 'enemy';
        const player = {
            id: playerId,
            name,
            team,
            ready: false,
            units: [],
            gold: 0
        };
        this.matchState.players.set(playerId, player);
        this.updateLobby();
        this.door.send(`${name} joined the match!`);
    }
    /**
     * Handle player left
     */
    handlePlayerLeft(playerId) {
        const player = this.matchState.players.get(playerId);
        if (player) {
            this.door.send(`${player.name} left the match.`);
            this.matchState.players.delete(playerId);
            this.updateLobby();
        }
    }
    /**
     * Handle network message
     */
    handleNetworkMessage(message) {
        switch (message.type) {
            case MessageType.Ready:
                this.handleReady(message.playerId);
                break;
            case MessageType.Move:
                this.handleMove(message.playerId, message.data);
                break;
            case MessageType.Attack:
                this.handleAttack(message.playerId, message.data);
                break;
            case MessageType.EndTurn:
                this.handleEndTurn(message.playerId);
                break;
            case MessageType.Draft:
                this.handleDraft(message.playerId, message.data);
                break;
            case MessageType.Chat:
                this.handleChat(message.playerId, message.data);
                break;
            case MessageType.Sync:
                this.handleSync(message.data);
                break;
        }
    }
    /**
     * Handle player ready
     */
    handleReady(playerId) {
        const player = this.matchState.players.get(playerId);
        if (player) {
            player.ready = true;
            this.updateLobby();
            // Check if all ready
            const allReady = Array.from(this.matchState.players.values()).every(p => p.ready);
            if (allReady) {
                this.startMatch();
            }
        }
    }
    /**
     * Start the match
     */
    startMatch() {
        if (this.matchState.mode === MultiplayerMode.DraftBattle) {
            this.startDraft();
        }
        else {
            this.startBattle();
        }
    }
    /**
     * Start draft phase
     */
    startDraft() {
        this.matchState.phase = 'draft';
        this.createDraftPool();
        this.determineDraftOrder();
        this.renderDraft();
    }
    /**
     * Create draft pool of units
     */
    createDraftPool() {
        const classes = [
            'lord', 'cavalier', 'knight', 'myrmidon', 'mage',
            'archer', 'pegasus_knight', 'cleric', 'mercenary', 'fighter'
        ];
        for (let i = 0; i < 20; i++) {
            const classId = classes[i % classes.length];
            const classData = this.classes.getClass(classId);
            if (classData) {
                const unit = this.combat.createUnit({
                    id: `draft_${i}`,
                    name: classData.name,
                    class: classData.name,
                    level: 5,
                    stats: {
                        hp: 20,
                        str: 8,
                        mag: 5,
                        skl: 7,
                        spd: 7,
                        lck: 5,
                        def: 6,
                        res: 4,
                        mov: classData.baseStats.mov || 5
                    },
                    growthRates: classData.growthRates,
                    position: { x: 0, y: 0 },
                    team: 'player'
                });
                this.draftPool.push(unit);
            }
        }
    }
    /**
     * Determine draft order
     */
    determineDraftOrder() {
        const playerIds = Array.from(this.matchState.players.keys());
        // Alternate picks (P1, P2, P2, P1, P1, P2...)
        const picksPerPlayer = 5;
        for (let i = 0; i < picksPerPlayer * 2; i++) {
            if (i % 4 < 2) {
                this.draftOrder.push(playerIds[0]);
            }
            else {
                this.draftOrder.push(playerIds[1]);
            }
        }
    }
    /**
     * Handle draft pick
     */
    handleDraft(playerId, data) {
        const currentPicker = this.draftOrder[this.currentDraftPick];
        if (playerId !== currentPicker) {
            return; // Not their turn
        }
        const unitIndex = this.draftPool.findIndex(u => u.id === data.unitId);
        if (unitIndex === -1) {
            return; // Unit not in pool
        }
        const unit = this.draftPool.splice(unitIndex, 1)[0];
        const player = this.matchState.players.get(playerId);
        if (player) {
            unit.team = player.team;
            player.units.push(unit);
        }
        this.currentDraftPick++;
        if (this.currentDraftPick >= this.draftOrder.length) {
            // Draft complete
            this.startBattle();
        }
        else {
            this.renderDraft();
        }
    }
    /**
     * Render draft screen
     */
    renderDraft() {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(30, 1, 'DRAFT PHASE', index_1.AnsiColor.Yellow);
        const currentPicker = this.draftOrder[this.currentDraftPick];
        const pickerName = this.matchState.players.get(currentPicker)?.name || 'Unknown';
        this.gfx.drawText(25, 3, `${pickerName}'s Pick`, index_1.AnsiColor.White);
        // Draw draft pool
        this.gfx.drawText(5, 5, 'Available Units:', index_1.AnsiColor.Cyan);
        for (let i = 0; i < this.draftPool.length; i++) {
            const unit = this.draftPool[i];
            const y = 7 + i;
            this.gfx.drawText(5, y, `${i + 1}. ${unit.name} Lv${unit.level}`, index_1.AnsiColor.White);
            this.gfx.drawText(30, y, `HP:${unit.stats.hp} Str:${unit.stats.str} Spd:${unit.stats.spd}`, index_1.AnsiColor.Gray);
        }
        // Draw drafted teams
        let x = 55;
        for (const player of this.matchState.players.values()) {
            this.gfx.drawText(x, 5, player.name, player.team === 'player' ? index_1.AnsiColor.Blue : index_1.AnsiColor.Red);
            for (let i = 0; i < player.units.length; i++) {
                this.gfx.drawText(x, 7 + i, player.units[i].name, index_1.AnsiColor.White);
            }
            x += 20;
        }
        this.door.send(this.gfx.render());
    }
    /**
     * Start battle phase
     */
    startBattle() {
        this.matchState.phase = 'battle';
        this.matchState.turnCount = 1;
        // Load skirmish map
        const map = this.createSkirmishMap();
        this.combat.loadMap(map);
        // Deploy units
        this.deployUnits();
        // Determine first player
        const playerIds = Array.from(this.matchState.players.keys());
        this.matchState.currentTurn = playerIds[0];
        this.renderBattle();
    }
    /**
     * Create skirmish map
     */
    createSkirmishMap() {
        return {
            width: 20,
            height: 15,
            tiles: []
        };
        // Simplified - would generate actual tactical map
    }
    /**
     * Deploy units on map
     */
    deployUnits() {
        let playerX = 2;
        let enemyX = 17;
        for (const player of this.matchState.players.values()) {
            const x = player.team === 'player' ? playerX : enemyX;
            let y = 5;
            for (const unit of player.units) {
                unit.position = { x, y };
                y += 2;
            }
        }
    }
    /**
     * Handle move command
     */
    handleMove(playerId, data) {
        if (playerId !== this.matchState.currentTurn) {
            return; // Not their turn
        }
        const player = this.matchState.players.get(playerId);
        if (!player)
            return;
        const unit = player.units.find(u => u.id === data.unitId);
        if (unit && !unit.hasMoved) {
            const validMoves = this.combat.getMovementRange(unit);
            const isValid = validMoves.some(pos => pos.x === data.position.x && pos.y === data.position.y);
            if (isValid) {
                this.combat.moveUnit(unit.id, data.position);
                unit.hasMoved = true;
                this.syncState();
                this.renderBattle();
            }
        }
    }
    /**
     * Handle attack command
     */
    handleAttack(playerId, data) {
        if (playerId !== this.matchState.currentTurn) {
            return;
        }
        const attacker = this.findUnitById(data.attackerId);
        const defender = this.findUnitById(data.defenderId);
        if (attacker && defender && !attacker.hasActed) {
            const result = this.combat.executeCombat(attacker, defender);
            attacker.hasActed = true;
            // Check for defeat
            if (defender.stats.hp <= 0) {
                this.handleUnitDefeat(defender);
            }
            this.syncState();
            this.renderBattle();
            this.checkVictory();
        }
    }
    /**
     * Handle end turn
     */
    handleEndTurn(playerId) {
        if (playerId !== this.matchState.currentTurn) {
            return;
        }
        // Reset units
        const player = this.matchState.players.get(playerId);
        if (player) {
            for (const unit of player.units) {
                unit.hasActed = false;
                unit.hasMoved = false;
            }
        }
        // Next player
        const playerIds = Array.from(this.matchState.players.keys());
        const currentIndex = playerIds.indexOf(this.matchState.currentTurn);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        this.matchState.currentTurn = playerIds[nextIndex];
        if (nextIndex === 0) {
            this.matchState.turnCount++;
        }
        this.syncState();
        this.renderBattle();
    }
    /**
     * Handle unit defeat
     */
    handleUnitDefeat(unit) {
        for (const player of this.matchState.players.values()) {
            const index = player.units.findIndex(u => u.id === unit.id);
            if (index !== -1) {
                player.units.splice(index, 1);
                break;
            }
        }
    }
    /**
     * Find unit by ID
     */
    findUnitById(unitId) {
        for (const player of this.matchState.players.values()) {
            const unit = player.units.find(u => u.id === unitId);
            if (unit)
                return unit;
        }
        return undefined;
    }
    /**
     * Check victory conditions
     */
    checkVictory() {
        for (const player of this.matchState.players.values()) {
            if (player.units.length === 0) {
                // Player defeated
                const winner = Array.from(this.matchState.players.values()).find(p => p.id !== player.id);
                if (winner) {
                    this.matchState.phase = 'victory';
                    this.matchState.winner = winner.id;
                    this.showVictory(winner.name);
                }
            }
        }
    }
    /**
     * Sync state to all players
     */
    syncState() {
        this.network.broadcast(MessageType.Sync, {
            playerId: this.localPlayerId,
            data: this.serializeState()
        });
    }
    /**
     * Handle state sync
     */
    handleSync(data) {
        // Update local state from network
        this.deserializeState(data);
        this.renderBattle();
    }
    /**
     * Serialize match state
     */
    serializeState() {
        return {
            currentTurn: this.matchState.currentTurn,
            turnCount: this.matchState.turnCount,
            phase: this.matchState.phase,
            players: Array.from(this.matchState.players.entries()).map(([id, player]) => ({
                id,
                name: player.name,
                team: player.team,
                units: player.units.map(u => ({
                    id: u.id,
                    position: u.position,
                    stats: u.stats,
                    hasActed: u.hasActed,
                    hasMoved: u.hasMoved
                }))
            }))
        };
    }
    /**
     * Deserialize match state
     */
    deserializeState(data) {
        this.matchState.currentTurn = data.currentTurn;
        this.matchState.turnCount = data.turnCount;
        this.matchState.phase = data.phase;
        for (const playerData of data.players) {
            const player = this.matchState.players.get(playerData.id);
            if (player) {
                for (const unitData of playerData.units) {
                    const unit = player.units.find(u => u.id === unitData.id);
                    if (unit) {
                        unit.position = unitData.position;
                        unit.stats = unitData.stats;
                        unit.hasActed = unitData.hasActed;
                        unit.hasMoved = unitData.hasMoved;
                    }
                }
            }
        }
    }
    /**
     * Handle chat message
     */
    handleChat(playerId, data) {
        const player = this.matchState.players.get(playerId);
        if (player) {
            this.door.send(`[${player.name}]: ${data.message}`);
        }
    }
    /**
     * Send chat message
     */
    sendChat(message) {
        this.network.broadcast(MessageType.Chat, {
            playerId: this.localPlayerId,
            data: { message }
        });
    }
    /**
     * Render battle screen
     */
    renderBattle() {
        this.gfx.clear(index_1.AnsiColor.Black);
        // Draw map
        // Simplified - would render full tactical map
        // Draw units
        for (const player of this.matchState.players.values()) {
            const color = player.team === 'player' ? index_1.AnsiColor.Blue : index_1.AnsiColor.Red;
            for (const unit of player.units) {
                this.gfx.drawChar(unit.position.x, unit.position.y, 'U', color);
            }
        }
        // Draw HUD
        this.renderMultiplayerHUD();
        this.door.send(this.gfx.render());
    }
    /**
     * Render multiplayer HUD
     */
    renderMultiplayerHUD() {
        this.gfx.drawText(0, 16, `Turn: ${this.matchState.turnCount}`, index_1.AnsiColor.White);
        const currentPlayer = this.matchState.players.get(this.matchState.currentTurn);
        if (currentPlayer) {
            this.gfx.drawText(0, 17, `Current: ${currentPlayer.name}`, index_1.AnsiColor.Yellow);
        }
        // Show unit counts
        let y = 18;
        for (const player of this.matchState.players.values()) {
            const color = player.team === 'player' ? index_1.AnsiColor.Blue : index_1.AnsiColor.Red;
            this.gfx.drawText(0, y, `${player.name}: ${player.units.length} units`, color);
            y++;
        }
    }
    /**
     * Show matchmaking screen
     */
    showMatchmaking() {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(25, 10, 'Searching for opponent...', index_1.AnsiColor.Yellow);
        this.door.send(this.gfx.render());
    }
    /**
     * Show lobby
     */
    showLobby(lobbyCode) {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(30, 5, 'LOBBY', index_1.AnsiColor.Cyan);
        this.gfx.drawText(25, 7, `Code: ${lobbyCode}`, index_1.AnsiColor.Yellow);
        this.updateLobby();
    }
    /**
     * Update lobby display
     */
    updateLobby() {
        let y = 10;
        for (const player of this.matchState.players.values()) {
            const status = player.ready ? '[READY]' : '[NOT READY]';
            const color = player.ready ? index_1.AnsiColor.Green : index_1.AnsiColor.Red;
            this.gfx.drawText(20, y, `${player.name} ${status}`, color);
            y++;
        }
        this.door.send(this.gfx.render());
    }
    /**
     * Show connecting screen
     */
    showConnecting() {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(30, 10, 'Connecting...', index_1.AnsiColor.Yellow);
        this.door.send(this.gfx.render());
    }
    /**
     * Show connection error
     */
    showConnectionError() {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(25, 10, 'Connection Lost!', index_1.AnsiColor.Red);
        this.door.send(this.gfx.render());
    }
    /**
     * Show victory screen
     */
    showVictory(winnerName) {
        this.gfx.clear(index_1.AnsiColor.Black);
        this.gfx.drawText(25, 10, `${winnerName} WINS!`, index_1.AnsiColor.Green);
        this.door.send(this.gfx.render());
    }
    /**
     * Generate lobby code
     */
    generateLobbyCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    /**
     * Send ready status
     */
    setReady(ready) {
        const player = this.matchState.players.get(this.localPlayerId);
        if (player) {
            player.ready = ready;
            this.network.broadcast(MessageType.Ready, {
                playerId: this.localPlayerId,
                data: { ready }
            });
        }
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.gfx.dispose();
        this.network.dispose();
        this.combat.dispose();
        this.classes.dispose();
    }
}
exports.MultiplayerManager = MultiplayerManager;
