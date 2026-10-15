"use strict";
/**
 * TetriNET lobby adapter (BBS-internal multiplayer)
 *
 * Rewritten 2026-08-25. The previous version kept its own private lobby
 * state and pushed every action through `network.emitNetwork('tetrinet:*')`,
 * which goes to the NetworkEngine's local EventEmitter and never leaves the
 * process - it then listened for those same events coming back. Nothing
 * crossed a node boundary, so two BBS users each sat in their own private
 * lobby and a "multiplayer" match was always one human plus bots.
 *
 * It now extends BrokerLobbyAdapter - the same broker plumbing Grandmaster's
 * versus lobby uses (players, ready, chat, host-only start, bot fill) - and
 * adds only what TetriNET needs on top: six numbered slots, teams, the game
 * options editor and the winlist. Team and settings changes travel over the
 * broker's game channel so every node's lobby agrees.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetLobbyAdapter = void 0;
const broker_lobby_adapter_1 = require("./broker-lobby-adapter");
const game_rules_1 = require("../core/tetrinet/game-rules");
// Must sit in a broker protocol namespace or it never leaves this node -
// see TetriNetBrokerTransport for the same constraint.
const LOBBY_EVENT = 'game:tnet_lobby';
const MAX_SLOTS = 6;
class TetriNetLobbyAdapter extends broker_lobby_adapter_1.BrokerLobbyAdapter {
    constructor(network, localPlayerId, rule = 'standard') {
        super(network, localPlayerId ?? network.getLocalPlayerId() ?? 'local');
        this.winlist = [];
        this.teams = new Map();
        this.unsubscribeSync = null;
        this.rule = rule;
        this.options = (0, game_rules_1.getDefaultOptions)(rule);
        this.unsubscribeSync = network.onGameEvent(LOBBY_EVENT, (packet) => {
            this.applySync(packet);
        });
    }
    /** TetriNET seats six players. */
    lobbySize() {
        return MAX_SLOTS;
    }
    /** Rule set the lobby was opened with. */
    getRule() {
        return this.rule;
    }
    /** Options the match should start with, after any host edits. */
    getGameOptions() {
        return this.options;
    }
    /**
     * Seed the Winlist tab.
     *
     * The old adapter wrote state.winlist in exactly one place: the handler
     * for an external server's 'tetrinet:winlist' message, which nothing on
     * the in-process bus ever emits. Local lobbies showed an empty tab for
     * ever. app.ts now seeds it from the door's own TetriNET high scores.
     */
    setLocalWinlist(entries) {
        this.winlist = entries;
        this.emit('state:updated');
    }
    /**
     * Kept for callers that announced the local player before the lobby
     * existed. The broker seats the local player itself when the lobby is
     * created or joined, so this only refreshes the widget.
     */
    addLocalPlayer(_name, _slot) {
        this.emit('state:updated');
    }
    getState() {
        const base = super.getState();
        if (!base)
            return null;
        return {
            ...base,
            players: base.players.map((player, index) => this.decorate(player, index)),
            settings: this.options,
            leaderboard: this.winlist,
        };
    }
    async setTeam(team) {
        this.teams.set(this.localPlayerId, team);
        const packet = { kind: 'team', playerId: this.localPlayerId, team };
        this.network.sendGameEvent(LOBBY_EVENT, packet);
        this.emit('state:updated');
    }
    async updateSettings(settings) {
        this.options = (0, game_rules_1.optionsFromLobbySettings)(this.rule, settings);
        const packet = { kind: 'settings', settings };
        this.network.sendGameEvent(LOBBY_EVENT, packet);
        this.emit('settings:updated', this.options);
        this.emit('state:updated');
    }
    dispose() {
        this.unsubscribeSync?.();
        this.unsubscribeSync = null;
        super.dispose();
    }
    /** Slot numbers and team names are TetriNET's, not the broker's. */
    decorate(player, index) {
        return {
            ...player,
            slot: (index + 1),
            team: this.teams.get(player.id) ?? '',
        };
    }
    applySync(packet) {
        if (packet.kind === 'team' && packet.playerId) {
            this.teams.set(packet.playerId, packet.team ?? '');
            this.emit('state:updated');
            return;
        }
        if (packet.kind === 'settings' && packet.settings) {
            this.options = (0, game_rules_1.optionsFromLobbySettings)(this.rule, packet.settings);
            this.emit('settings:updated', this.options);
            this.emit('state:updated');
        }
    }
}
exports.TetriNetLobbyAdapter = TetriNetLobbyAdapter;
//# sourceMappingURL=tetrinet-lobby-adapter.js.map