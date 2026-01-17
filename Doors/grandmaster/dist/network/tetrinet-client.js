"use strict";
/**
 * TetriNET 1.x External Server Client
 *
 * Connects to external TetriNET servers on port 31457 (or 31458 for TSpec).
 * Implements the TetriNET protocol with XOR-encrypted login.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetClient = void 0;
exports.createTetriNetClient = createTetriNetClient;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const net = __importStar(require("net"));
const tetrinet_protocol_1 = require("./tetrinet-protocol");
/**
 * TetriNET 1.x Client
 *
 * Events:
 * - 'connected': Successfully connected and assigned slot
 * - 'disconnected': Connection closed
 * - 'error': Connection or protocol error
 * - 'player:joined': Player joined the room
 * - 'player:left': Player left the room
 * - 'player:team': Player changed team
 * - 'chat': Chat message received
 * - 'game:start': Game starting
 * - 'game:end': Game ended
 * - 'field:update': Field update received
 * - 'special:used': Special was used
 * - 'player:lost': Player topped out
 * - 'player:won': Player won the game
 * - 'level:update': Level update received
 * - 'winlist': Winlist update
 * - 'spectator:list': Spectator list update
 * - 'spectator:joined': Spectator joined
 * - 'spectator:left': Spectator left
 * - 'spectator:chat': Spectator chat
 */
class TetriNetClient extends blessed_1.EventEmitter {
    constructor(options) {
        super();
        this.socket = null;
        this.state = 'disconnected';
        this.mySlot = null;
        this.players = new Map();
        this.spectators = new Set();
        this.buffer = '';
        this.serverIp = '127.0.0.1';
        this.eventBacklog = [];
        const mode = options.mode || 'tetrifast';
        const defaultPort = mode === 'tspec' ? 31458 : 31457;
        const fallbackTeam = (options.team ?? '').trim() || options.nickname.substring(0, 15);
        this.options = {
            host: options.host,
            port: options.port || defaultPort,
            nickname: options.nickname.substring(0, 15), // TetriNET max 15 chars
            team: fallbackTeam,
            mode,
            password: options.password || '',
            timeout: options.timeout || 30000,
        };
    }
    /**
     * Get current connection state
     */
    getState() {
        return this.state;
    }
    /**
     * Get assigned slot
     */
    getSlot() {
        return this.mySlot;
    }
    /**
     * Get all players
     */
    getPlayers() {
        return Array.from(this.players.values());
    }
    /**
     * Get spectator list
     */
    getSpectators() {
        return Array.from(this.spectators.values());
    }
    /**
     * Replay buffered events (used when listeners attach after connect).
     */
    drainBacklog() {
        const pending = [...this.eventBacklog];
        this.eventBacklog = [];
        for (const entry of pending) {
            this.emit(entry.event, ...entry.args);
        }
    }
    emitEvent(event, ...args) {
        if (this.listenerCount(event) === 0) {
            this.eventBacklog.push({ event, args });
        }
        this.emit(event, ...args);
    }
    /**
     * Get player by slot
     */
    getPlayer(slot) {
        return this.players.get(slot);
    }
    getServerIp(socket) {
        if (!socket || !socket.remoteAddress) {
            return '127.0.0.1';
        }
        const addr = socket.remoteAddress;
        if (addr.includes('.')) {
            return addr.split(':').pop() || addr;
        }
        return '127.0.0.1';
    }
    /**
     * Connect to server
     */
    async connect() {
        if (this.state !== 'disconnected') {
            throw new Error('Already connected or connecting');
        }
        console.log(`[TetriNetClient] Connecting to ${this.options.host}:${this.options.port}...`);
        this.state = 'connecting';
        this.emit('state:change', this.state);
        const isTspec = this.options.mode === 'tspec';
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.log(`[TetriNetClient] Connection timeout after ${this.options.timeout}ms`);
                this.disconnect();
                reject(new Error('Connection timeout'));
            }, this.options.timeout);
            this.socket = new net.Socket();
            this.socket.on('connect', () => {
                clearTimeout(timeout);
                console.log(`[TetriNetClient] Socket connected to ${this.options.host}:${this.options.port}`);
                this.emit('status', 'TCP connected, sending login...');
                this.serverIp = this.getServerIp(this.socket);
                console.log(`[TetriNetClient] Using server IP for encryption: ${this.serverIp}`);
                this.emit('status', `Encrypting login with server IP ${this.serverIp}...`);
                // Send encrypted login
                this.sendLogin();
                this.emit('status', 'Login sent, awaiting slot assignment...');
            });
            this.socket.on('data', (data) => {
                const hex = data.toString('hex').substring(0, 60);
                const latin1 = data.toString('latin1').substring(0, 100);
                console.log(`[TetriNetClient] Received ${data.length} bytes: ${hex}`);
                console.log(`[TetriNetClient] As text: ${latin1}`);
                this.emit('status', `Received ${data.length} bytes from server`);
                this.handleData(data);
            });
            this.socket.on('close', () => {
                console.log(`[TetriNetClient] Connection closed`);
                this.handleClose();
            });
            this.socket.on('error', (error) => {
                console.log(`[TetriNetClient] Socket error: ${error.message}`);
                clearTimeout(timeout);
                this.state = 'error';
                this.emit('state:change', this.state);
                this.emit('error', error);
                reject(error);
            });
            if (isTspec) {
                const onSpectatorConnected = () => {
                    console.log(`[TetriNetClient] TSpec connection established`);
                    clearTimeout(timeout);
                    this.removeListener('connected:spectator', onSpectatorConnected);
                    resolve();
                };
                this.on('connected:spectator', onSpectatorConnected);
            }
            else {
                // Listen for successful slot assignment
                const onConnected = (slot) => {
                    console.log(`[TetriNetClient] Successfully connected, assigned slot ${slot}`);
                    clearTimeout(timeout);
                    this.removeListener('connected', onConnected);
                    resolve();
                };
                this.on('connected', onConnected);
            }
            // Connect
            console.log(`[TetriNetClient] Initiating TCP connection...`);
            this.socket.connect(this.options.port, this.options.host);
        });
    }
    /**
     * Disconnect from server
     */
    disconnect() {
        console.log(`[TetriNetClient] Disconnecting...`);
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.state = 'disconnected';
        this.mySlot = null;
        this.players.clear();
        this.spectators.clear();
        this.buffer = '';
        this.emit('state:change', this.state);
        this.emit('disconnected');
        console.log(`[TetriNetClient] Disconnected`);
    }
    /**
     * Send field update
     */
    sendField(field) {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetField)(this.mySlot, field));
    }
    /**
     * Send special usage
     */
    sendSpecial(target, special) {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetSpecial)(target, special, this.mySlot));
    }
    /**
     * Send level update
     */
    sendLevel(level) {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetLevel)(this.mySlot, level));
    }
    /**
     * Send chat message
     */
    sendChat(message) {
        if (this.options.mode === 'tspec') {
            const trimmed = message.trim();
            const isPublic = trimmed.startsWith('//');
            const text = isPublic ? trimmed.substring(2).trimStart() : trimmed;
            if (!text)
                return;
            console.log(`[TetriNetClient] Sending TSpec chat: ${text}`);
            this.send((0, tetrinet_protocol_1.formatTspecChat)(text, isPublic));
            return;
        }
        if (!this.mySlot)
            return;
        console.log(`[TetriNetClient] Sending chat: ${message}`);
        this.send((0, tetrinet_protocol_1.formatTetrenetChat)(this.mySlot, message));
    }
    /**
     * Send version string
     */
    sendVersion(version) {
        this.send((0, tetrinet_protocol_1.formatTetrenetVersion)(version));
    }
    /**
     * Send start/stop game (operator only).
     */
    sendStartGame(start) {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetStartGame)(start, this.mySlot));
    }
    /**
     * Send pause/resume (operator only).
     */
    sendPause(pause) {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetPause)(pause, this.mySlot));
    }
    /**
     * Send /me action
     */
    sendAction(action) {
        if (!this.mySlot)
            return;
        console.log(`[TetriNetClient] Sending action: ${action}`);
        this.send((0, tetrinet_protocol_1.formatTetrenetAction)(this.mySlot, action));
    }
    /**
     * Set team
     */
    setTeam(team) {
        if (!this.mySlot)
            return;
        const normalized = team.trim();
        const resolvedTeam = normalized || this.options.nickname;
        console.log(`[TetriNetClient] Setting team: ${resolvedTeam}`);
        this.send((0, tetrinet_protocol_1.formatTetrenetTeam)(this.mySlot, resolvedTeam));
    }
    /**
     * Report player lost (topped out)
     */
    sendPlayerLost() {
        if (!this.mySlot)
            return;
        this.send((0, tetrinet_protocol_1.formatTetrenetPlayerLost)(this.mySlot));
    }
    /**
     * Send raw line (for testing)
     */
    sendRaw(line) {
        this.send(line);
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    sendLogin() {
        console.log(`[TetriNetClient] Preparing encrypted login for nick '${this.options.nickname}', mode '${this.options.mode}', server IP '${this.serverIp}'`);
        // TetriNET login is encrypted with IP-based rolling hash (server IP)
        const loginMessage = (0, tetrinet_protocol_1.formatTetrenetLogin)(this.options.nickname, this.serverIp, this.options.mode, this.options.mode === 'tspec' ? this.options.password : '1.13');
        // Login is sent as ASCII hex followed by 0xFF terminator
        console.log(`[TetriNetClient] Sending login hex (${loginMessage.length} chars): ${loginMessage.substring(0, 60)}...`);
        this.emit('status', `Sent login hex (${loginMessage.length} chars)`);
        this.send(loginMessage);
    }
    send(line) {
        if (!this.socket || this.state === 'disconnected')
            return;
        // TetriNET messages end with 0xFF byte (must be raw 0xFF, not UTF-8)
        const payload = Buffer.from(line, 'latin1');
        const terminator = Buffer.from([0xFF]);
        this.socket.write(Buffer.concat([payload, terminator]));
    }
    handleData(data) {
        // TetriNET uses 0xFF as message delimiter
        this.buffer += data.toString('latin1');
        // Split by 0xFF
        const parts = this.buffer.split(String.fromCharCode(0xFF));
        this.buffer = parts.pop() || ''; // Keep incomplete message
        for (const line of parts) {
            if (line.trim()) {
                this.handleMessage(line);
            }
        }
    }
    handleMessage(line) {
        const message = (0, tetrinet_protocol_1.parseTetrenetMessage)(line);
        if (!message) {
            // Unknown message, log for debugging
            const hex = Buffer.from(line, 'latin1').toString('hex');
            console.log(`[TetriNetClient] Unknown message: ${line.substring(0, 100)} (hex: ${hex.substring(0, 40)})`);
            this.emit('raw', line);
            return;
        }
        console.log(`[TetriNetClient] Parsed message type: ${message.type}`);
        if (this.options.mode === 'tspec' && this.state === 'connecting') {
            if (message.type !== 'tetrinet:connect_error'
                && message.type !== 'tetrinet:disconnect'
                && message.type !== 'tetrinet:kick') {
                this.state = 'connected';
                this.emit('state:change', this.state);
                this.emit('connected:spectator');
            }
        }
        switch (message.type) {
            case 'tetrinet:join': {
                // Initial slot assignment
                const joinMsg = message;
                if (joinMsg.slot) {
                    const slot = joinMsg.slot;
                    this.mySlot = slot;
                    this.state = 'connected';
                    this.emitEvent('state:change', this.state);
                    this.emitEvent('connected', slot);
                    // Add self to players
                    const self = {
                        slot: slot,
                        name: this.options.nickname,
                        team: this.options.team,
                        alive: true,
                        level: 1,
                    };
                    this.players.set(slot, self);
                    this.emitEvent('player:joined', self);
                    // Acknowledge connection (gtetrinet sends connected after playernum)
                    this.send((0, tetrinet_protocol_1.formatTetrenetConnected)());
                    // Send team (matches gtetrinet flow)
                    this.setTeam(this.options.team ?? '');
                }
                break;
            }
            case 'tetrinet:player_joined': {
                const playerMsg = message;
                const existingPlayer = this.players.get(playerMsg.player.slot);
                if (existingPlayer && playerMsg.player.team !== undefined) {
                    // Team update for existing player
                    existingPlayer.team = playerMsg.player.team;
                    this.emitEvent('player:team', {
                        slot: playerMsg.player.slot,
                        team: playerMsg.player.team,
                    });
                }
                else if (!existingPlayer && playerMsg.player.name) {
                    // New player joined
                    this.players.set(playerMsg.player.slot, playerMsg.player);
                    this.emitEvent('player:joined', playerMsg.player);
                }
                break;
            }
            case 'tetrinet:player_left': {
                const leftMsg = message;
                const player = this.players.get(leftMsg.slot);
                this.players.delete(leftMsg.slot);
                this.emitEvent('player:left', { slot: leftMsg.slot, player });
                break;
            }
            case 'tetrinet:chat': {
                const chatMsg = message;
                const player = this.players.get(chatMsg.senderSlot);
                const senderSlot = chatMsg.senderSlot;
                const senderName = senderSlot === 0 ? 'Server' : (player?.name || `Player ${senderSlot}`);
                this.emitEvent('chat', {
                    slot: senderSlot,
                    name: senderName,
                    text: chatMsg.text,
                    isAction: chatMsg.isAction,
                    isGameMessage: chatMsg.isGameMessage,
                });
                break;
            }
            case 'tetrinet:winlist': {
                const winlistMsg = message;
                this.emitEvent('winlist', winlistMsg.entries);
                break;
            }
            case 'tetrinet:spectator_list': {
                const specMsg = message;
                this.spectators = new Set(specMsg.names || []);
                this.emitEvent('spectator:list', this.getSpectators());
                break;
            }
            case 'tetrinet:spectator_joined': {
                const specMsg = message;
                if (specMsg.name) {
                    this.spectators.add(specMsg.name);
                }
                this.emitEvent('spectator:joined', specMsg.name);
                break;
            }
            case 'tetrinet:spectator_left': {
                const specMsg = message;
                if (specMsg.name) {
                    this.spectators.delete(specMsg.name);
                }
                this.emitEvent('spectator:left', specMsg.name);
                break;
            }
            case 'tetrinet:spectator_chat': {
                const specMsg = message;
                this.emitEvent('spectator:chat', {
                    name: specMsg.name,
                    text: specMsg.text,
                    isAction: specMsg.isAction,
                });
                break;
            }
            case 'tetrinet:game_start': {
                const startMsg = message;
                this.state = 'playing';
                this.emitEvent('state:change', this.state);
                // Reset all players to alive
                for (const player of this.players.values()) {
                    player.alive = true;
                    player.level = startMsg.options?.startingLevel || 1;
                }
                this.emitEvent('game:start', {
                    options: startMsg.options,
                    inProgress: startMsg.inProgress,
                });
                break;
            }
            case 'tetrinet:game_over': {
                const overMsg = message;
                this.state = 'connected';
                this.emitEvent('state:change', this.state);
                this.emitEvent('game:end', {
                    winnerSlot: overMsg.winnerSlot,
                });
                break;
            }
            case 'tetrinet:field_update': {
                const fieldMsg = message;
                this.emitEvent('field:update', {
                    slot: fieldMsg.slot,
                    field: fieldMsg.field,
                    level: fieldMsg.level,
                });
                break;
            }
            case 'tetrinet:special_used': {
                const specialMsg = message;
                this.emitEvent('special:used', {
                    senderSlot: specialMsg.senderSlot,
                    targetSlot: specialMsg.targetSlot,
                    special: specialMsg.special,
                    classicLines: specialMsg.classicLines,
                });
                break;
            }
            case 'tetrinet:player_lost': {
                const lostMsg = message;
                const player = this.players.get(lostMsg.slot);
                if (player) {
                    player.alive = false;
                }
                this.emitEvent('player:lost', { slot: lostMsg.slot });
                break;
            }
            case 'tetrinet:options_update': {
                const optionsMsg = message;
                if (optionsMsg.options.winlist) {
                    this.emitEvent('winlist', optionsMsg.options.winlist);
                }
                if (optionsMsg.options.paused !== undefined) {
                    this.emitEvent('game:pause', optionsMsg.options.paused);
                }
                if (optionsMsg.options.clientInfoRequest) {
                    // Server requested client info, respond
                    this.send((0, tetrinet_protocol_1.formatTetrenetClientInfo)('GRANDMASTER', '1.0'));
                }
                break;
            }
            case 'tetrinet:connect': {
                this.emitEvent('status', 'Server acknowledged connection');
                break;
            }
            case 'tetrinet:disconnect': {
                const disconnectMsg = message;
                this.emitEvent('error', new Error(disconnectMsg.reason || 'Server disconnected'));
                this.disconnect();
                break;
            }
            case 'tetrinet:connect_error': {
                const errorMsg = message;
                this.emitEvent('error', new Error(errorMsg.reason || 'Connection rejected'));
                this.disconnect();
                break;
            }
            case 'tetrinet:kick': {
                const kickMsg = message;
                this.emitEvent('error', new Error(kickMsg.reason || 'Kicked by server'));
                this.disconnect();
                break;
            }
            case 'tetrinet:leave': {
                // Connection rejected
                const leaveMsg = message;
                this.emitEvent('error', new Error(leaveMsg.reason || 'Connection rejected'));
                this.disconnect();
                break;
            }
        }
    }
    handleClose() {
        if (this.state !== 'disconnected') {
            this.state = 'disconnected';
            this.mySlot = null;
            this.players.clear();
            this.spectators.clear();
            this.emitEvent('state:change', this.state);
            this.emitEvent('disconnected');
        }
    }
}
exports.TetriNetClient = TetriNetClient;
/**
 * Create a TetriNET client
 */
function createTetriNetClient(options) {
    return new TetriNetClient(options);
}
//# sourceMappingURL=tetrinet-client.js.map