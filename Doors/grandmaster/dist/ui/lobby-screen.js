"use strict";
/**
 * Lobby Screen
 *
 * Multiplayer lobby using the SDK's generic MultiplayerLobby widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyScreen = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_2 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const bot_lobby_1 = require("../network/bot-lobby");
/**
 * Adapter that wraps GrandmasterNetworkManager for the SDK MultiplayerLobby
 */
class GrandmasterLobbyAdapter extends blessed_2.EventEmitter {
    constructor(network) {
        super();
        this.botDifficulty = 5;
        this.network = network;
        this.setupEventForwarding();
    }
    setupEventForwarding() {
        // Forward network events to lobby adapter events
        // These come from the SDK lobby system via the broker
        this.network.on('player:joined', (player) => {
            this.emit('player:joined', this.convertPlayer(player));
            this.emit('state:updated');
        });
        this.network.on('player:left', (playerId) => {
            this.emit('player:left', playerId);
            this.emit('state:updated');
        });
        this.network.on('player:ready', (data) => {
            this.emit('player:ready', data);
            this.emit('state:updated');
        });
        this.network.on('match:starting', () => {
            this.emit('match:starting');
        });
        this.network.on('match:started', () => {
            this.emit('match:started');
        });
        this.network.on('lobby:updated', () => {
            this.emit('state:updated');
        });
    }
    convertPlayer(player) {
        return {
            id: player.id,
            name: player.name,
            ready: player.ready,
            isBot: player.isBot,
            botDifficulty: player.botDifficulty,
            extra: {
                rank: player.rank,
                rating: player.rating,
            },
        };
    }
    getState() {
        const matchState = this.network.getMatchState();
        console.log(`[GrandmasterLobbyAdapter] getState called, matchState=`, matchState ? { matchId: matchState.matchId, playerCount: matchState.players.length, status: matchState.status } : null);
        if (!matchState)
            return null;
        return {
            lobbyId: matchState.matchId,
            mode: matchState.mode,
            players: matchState.players.map(p => this.convertPlayer(p)),
            status: matchState.status === 'countdown' ? 'starting' : matchState.status === 'playing' ? 'in_progress' : 'waiting',
            hostId: matchState.players[0]?.id,
        };
    }
    async joinQueue(mode) {
        console.log(`[GrandmasterLobbyAdapter] joinQueue called, mode=${mode}`);
        await this.network.joinQueue(mode);
        console.log(`[GrandmasterLobbyAdapter] joinQueue complete, emitting state:updated`);
        this.emit('state:updated');
    }
    async createLobby(mode, isPrivate) {
        console.log(`[GrandmasterLobbyAdapter] createLobby called, mode=${mode}`);
        const lobbyId = await this.network.createLobby(mode, isPrivate);
        console.log(`[GrandmasterLobbyAdapter] createLobby complete, lobbyId=${lobbyId}, emitting state:updated`);
        this.emit('state:updated');
        return lobbyId;
    }
    async joinLobby(lobbyId) {
        await this.network.joinLobby(lobbyId);
    }
    async leaveLobby() {
        await this.network.leaveLobby();
    }
    async setReady(ready) {
        await this.network.setReady(ready);
    }
    async startMatch() {
        const state = this.getState();
        const matchState = this.network.getMatchState();
        if (!state || !matchState)
            return;
        const localPlayerId = matchState.players.find(p => !p.isBot)?.id;
        const isHost = !state.hostId || localPlayerId === state.hostId;
        if (!isHost)
            return; // Non-host never initiates — waits for broker game:start
        // Auto-fill with bots if not enough humans
        const humanCount = matchState.players.filter(p => !p.isBot).length;
        if (humanCount < 2) {
            await this.fillWithBots(this.botDifficulty);
        }
        // Host triggers countdown via broker — fires game:starting + game:start on ALL nodes,
        // which the network manager re-emits as match:starting + match:started for every lobby.
        await this.network.startMatch();
    }
    /**
     * Fill lobby with bots to meet minimum player count
     * @param difficulty Bot difficulty level (1-10)
     */
    async fillWithBots(difficulty) {
        const matchState = this.network.getMatchState();
        if (!matchState)
            return;
        // Get min players for current mode
        const modeMinPlayers = {
            versus_1v1: 2,
            team_2v2: 4,
            battle_royale: 2,
        };
        const minPlayers = modeMinPlayers[matchState.mode] || 2;
        const diff = (difficulty ?? this.botDifficulty);
        matchState.players = (0, bot_lobby_1.fillLobbyWithBots)(matchState.players, minPlayers, diff);
        console.log(`[GrandmasterLobbyAdapter] fillWithBots: mode=${matchState.mode}, minPlayers=${minPlayers}, now have ${matchState.players.length} players`);
        this.emit('state:updated');
    }
    removeBots() {
        const matchState = this.network.getMatchState();
        if (!matchState)
            return;
        matchState.players = (0, bot_lobby_1.removeBots)(matchState.players);
        this.emit('state:updated');
    }
    sendChat(message, _isAction) {
        // For local lobbies, just add the message to chat log
        // In a real networked game, this would broadcast to other players
        console.log(`[GrandmasterLobbyAdapter] sendChat: ${message}`);
        // Chat messages are handled by the SDK widget locally for now
    }
}
/**
 * Lobby Screen
 *
 * Thin wrapper around SDK's MultiplayerLobby widget
 */
class LobbyScreen {
    constructor(screen, state, sounds, network, localPlayerId) {
        this.lobby = null;
        this.screen = screen;
        this.state = state;
        this.sounds = sounds;
        this.network = network;
        this.localPlayerId = localPlayerId;
    }
    /**
     * Show lobby and wait for result
     */
    async show(mode, selectedMode) {
        // Enable mouse control for lobby interaction
        this.screen.program.enableMouse();
        // Create adapter
        const adapter = new GrandmasterLobbyAdapter(this.network);
        // Create lobby widget
        this.lobby = new blessed_1.MultiplayerLobby({
            parent: this.screen,
            adapter,
            localPlayerId: this.localPlayerId,
            title: 'GRANDMASTER LOBBY',
            features: {
                bots: true,
                settingsEditor: true,
                chat: true,
                leaderboard: true,
                readyFlow: false,
            },
            autoStartTimeout: 60,
            gameSettings: [
                {
                    key: 'startingLevel',
                    label: 'Start Level',
                    type: 'number',
                    min: 1,
                    max: 20,
                    default: 1,
                    hostOnly: true,
                },
                {
                    key: 'rule',
                    label: 'Rule Set',
                    type: 'select',
                    options: [
                        { value: 'classic', label: 'Classic' },
                        { value: 'standard', label: 'Standard' },
                        { value: 'extended', label: 'Extended' },
                    ],
                    default: 'standard',
                    hostOnly: true,
                },
                {
                    key: 'suddenDeath',
                    label: 'Sudden Death',
                    type: 'number',
                    min: 0,
                    max: 15,
                    default: 2,
                    description: 'Minutes until sudden death (0=off)',
                    hostOnly: true,
                },
                {
                    key: 'garbage',
                    label: 'Garbage Lines',
                    type: 'checkbox',
                    default: true,
                    hostOnly: true,
                },
            ],
            defaultBotDifficulty: 5,
            modes: {
                versus_1v1: { name: '1v1 Versus', maxPlayers: 2, minPlayers: 2 },
                team_2v2: { name: '2v2 Team Battle', maxPlayers: 4, minPlayers: 4 },
                battle_royale: { name: 'Battle Royale (99)', maxPlayers: 99, minPlayers: 2 },
            },
            onSound: (sound) => {
                // Map SDK sound names to GRANDMASTER sound effects
                const soundMap = {
                    select: 'menu_select',
                    error: 'error',
                    countdown: 'countdown',
                    join: 'menu_select',
                    leave: 'menu_select',
                    chat: 'menu_select',
                };
                const sfx = soundMap[sound];
                if (sfx) {
                    this.sounds.playSfx(sfx);
                }
            },
            formatPlayer: (player, isLocal, isHost) => {
                const hostBadge = isHost ? '{yellow-fg}[HOST]{/yellow-fg} ' : '';
                const youBadge = isLocal ? '{cyan-fg}(You){/cyan-fg} ' : '';
                const botBadge = player.isBot
                    ? `{magenta-fg}[CPU-${player.botDifficulty}]{/magenta-fg} `
                    : '';
                return `${hostBadge}${youBadge}${botBadge}{white-fg}${player.name}{/white-fg}`;
            },
        });
        // Convert lobby mode to entry mode
        const entryMode = mode === 'matchmaking' ? 'matchmaking' : 'custom';
        // Show and return result
        return await this.lobby.show(entryMode, selectedMode || 'versus_1v1');
    }
}
exports.LobbyScreen = LobbyScreen;
//# sourceMappingURL=lobby-screen.js.map