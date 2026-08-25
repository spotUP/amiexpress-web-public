"use strict";
/**
 * Lobby Screen
 *
 * Multiplayer lobby using the SDK's generic MultiplayerLobby widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyScreen = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const broker_lobby_adapter_1 = require("../network/broker-lobby-adapter");
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
        const adapter = new broker_lobby_adapter_1.BrokerLobbyAdapter(this.network, this.localPlayerId);
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
                // Start already bot-fills and launches on its own, and the
                // "waiting for other players" countdown auto-launches when it
                // expires - so a Force Start button would just be a second button
                // doing what Start does.
                forceStart: false,
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
        // Show and return result. Always detach the adapter afterwards: app.ts
        // loops back into the lobby after every match, building a new adapter
        // each time, so leaving the old one attached to the shared network
        // manager leaks a full set of handlers per visit.
        try {
            return await this.lobby.show(entryMode, selectedMode || 'versus_1v1');
        }
        finally {
            adapter.dispose();
        }
    }
}
exports.LobbyScreen = LobbyScreen;
//# sourceMappingURL=lobby-screen.js.map