/**
 * Connection Manager Module
 *
 * Handles Socket.IO connection to BBS server with:
 * - Connection state machine
 * - Automatic reconnection with exponential backoff
 * - Connection quality monitoring (RTT, packet loss, jitter)
 * - Heartbeat/keepalive system
 * - Connection recovery after disconnect
 */
import { EventEmitter } from 'events';
// Default configuration
const DEFAULT_CONFIG = {
    serverUrl: 'ws://localhost:3001',
    autoConnect: false,
    reconnect: true,
    reconnectAttempts: 10,
    reconnectDelay: 1000,
    reconnectDelayMax: 30000,
    heartbeatInterval: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
    auth: {},
};
// Latency thresholds for quality assessment
const QUALITY_THRESHOLDS = {
    excellent: { maxLatency: 50, maxJitter: 10, maxPacketLoss: 0.01 },
    good: { maxLatency: 100, maxJitter: 25, maxPacketLoss: 0.02 },
    fair: { maxLatency: 150, maxJitter: 50, maxPacketLoss: 0.05 },
    poor: { maxLatency: 250, maxJitter: 100, maxPacketLoss: 0.10 },
    // Anything worse is 'critical'
};
/**
 * Connection Manager
 *
 * Manages WebSocket connection to the BBS server with automatic
 * reconnection, quality monitoring, and event handling.
 */
export class ConnectionManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.name = 'connection';
        this.socket = null;
        this.latencySamples = [];
        this.packetsSent = 0;
        this.packetsReceived = 0;
        this.packetsLost = 0;
        this.lastPingTime = 0;
        this.pendingPings = new Map();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this._state = this.createInitialState();
    }
    /**
     * Create initial connection state
     */
    createInitialState() {
        return {
            status: 'disconnected',
            latency: 0,
            packetLoss: 0,
            jitter: 0,
            quality: 'good',
            bytesReceived: 0,
            bytesSent: 0,
            reconnectAttempts: 0,
        };
    }
    /**
     * Get current connection state
     */
    get state() {
        return { ...this._state };
    }
    /**
     * Get underlying socket instance
     */
    getSocket() {
        return this.socket;
    }
    /**
     * Initialize the connection manager
     */
    async init() {
        if (this.config.autoConnect) {
            await this.connect();
        }
    }
    /**
     * Connect to the server
     */
    async connect(config) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        if (this._state.status === 'connected' || this._state.status === 'connecting') {
            return;
        }
        this.setStatus('connecting');
        try {
            await this.createSocket();
        }
        catch (error) {
            this.setStatus('error');
            throw error;
        }
    }
    /**
     * Create and configure Socket.IO connection
     */
    async createSocket() {
        return new Promise((resolve, reject) => {
            // Dynamic import for Socket.IO client
            import('socket.io-client').then(({ io }) => {
                this.socket = io(this.config.serverUrl, {
                    transports: this.config.transports,
                    timeout: this.config.timeout,
                    reconnection: false, // We handle reconnection ourselves
                    auth: this.config.auth,
                });
                // Connection successful
                this.socket.on('connect', () => {
                    this.setStatus('connected');
                    this._state.connectedAt = new Date();
                    this._state.reconnectAttempts = 0;
                    this.startHeartbeat();
                    this.startLatencyMonitoring();
                    this.emit('connect');
                    resolve();
                });
                // Connection error
                this.socket.on('connect_error', (error) => {
                    if (this._state.status === 'connecting') {
                        reject(error);
                    }
                    this.handleConnectionError(error);
                });
                // Disconnection
                this.socket.on('disconnect', (reason) => {
                    this.handleDisconnect(reason);
                });
                // Pong response for latency measurement
                this.socket.on('pong', (timestamp) => {
                    this.handlePong(timestamp);
                });
                // Track bytes received
                this.socket.io.on('packet', (packet) => {
                    if (packet.data) {
                        this._state.bytesReceived += JSON.stringify(packet.data).length;
                    }
                    this.packetsReceived++;
                });
                // Connection timeout
                setTimeout(() => {
                    if (this._state.status === 'connecting') {
                        this.socket?.disconnect();
                        reject(new Error('Connection timeout'));
                    }
                }, this.config.timeout);
            }).catch((error) => {
                // Socket.IO not available (server-side)
                console.warn('ConnectionManager: Socket.IO client not available, using mock connection');
                this.useMockConnection();
                resolve();
            });
        });
    }
    /**
     * Use mock connection for server-side or testing
     */
    useMockConnection() {
        this.setStatus('connected');
        this._state.connectedAt = new Date();
        this._state.latency = 10;
        this._state.quality = 'excellent';
        // Create mock socket with event emitter
        this.socket = new EventEmitter();
        this.socket.connected = true;
        this.socket.emit = (event, ...args) => {
            // Simulate network delay
            setTimeout(() => {
                this.socket.emit(`response:${event}`, ...args);
            }, 10);
            return true;
        };
        this.socket.disconnect = () => {
            this.handleDisconnect('client disconnect');
        };
        this.emit('connect');
    }
    /**
     * Handle connection errors
     */
    handleConnectionError(error) {
        this.emit('error', error);
        if (this.config.reconnect && this._state.reconnectAttempts < this.config.reconnectAttempts) {
            this.scheduleReconnect();
        }
        else {
            this.setStatus('error');
        }
    }
    /**
     * Handle disconnection
     */
    handleDisconnect(reason) {
        this.stopHeartbeat();
        this.stopLatencyMonitoring();
        this.emit('disconnect', reason);
        if (this.config.reconnect && reason !== 'io client disconnect') {
            this.scheduleReconnect();
        }
        else {
            this.setStatus('disconnected');
        }
    }
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this._state.reconnectAttempts++;
        this.setStatus('reconnecting');
        // Exponential backoff with jitter
        const baseDelay = Math.min(this.config.reconnectDelay * Math.pow(2, this._state.reconnectAttempts - 1), this.config.reconnectDelayMax);
        const jitter = baseDelay * 0.2 * Math.random();
        const delay = baseDelay + jitter;
        this.emit('reconnect_attempt', this._state.reconnectAttempts);
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.createSocket();
                this.emit('reconnect', this._state.reconnectAttempts);
            }
            catch (error) {
                if (this._state.reconnectAttempts < this.config.reconnectAttempts) {
                    this.scheduleReconnect();
                }
                else {
                    this.setStatus('disconnected');
                    this.emit('reconnect_failed');
                }
            }
        }, delay);
    }
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.stopHeartbeat();
        this.stopLatencyMonitoring();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.setStatus('disconnected');
    }
    /**
     * Set connection status
     */
    setStatus(status) {
        if (this._state.status !== status) {
            this._state.status = status;
            this.emit('status_change', status);
        }
    }
    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.connected) {
                const pingId = Date.now();
                this.pendingPings.set(pingId, pingId);
                this.packetsSent++;
                this.socket.emit('ping', pingId);
                // Track lost packets (pings not responded to within 5 seconds)
                setTimeout(() => {
                    if (this.pendingPings.has(pingId)) {
                        this.pendingPings.delete(pingId);
                        this.packetsLost++;
                        this.updatePacketLoss();
                    }
                }, 5000);
            }
        }, this.config.heartbeatInterval);
    }
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        this.pendingPings.clear();
    }
    /**
     * Handle pong response
     */
    handlePong(pingId) {
        if (this.pendingPings.has(pingId)) {
            const sentTime = this.pendingPings.get(pingId);
            const latency = Date.now() - sentTime;
            this.pendingPings.delete(pingId);
            this.addLatencySample(latency);
        }
    }
    /**
     * Start latency monitoring
     */
    startLatencyMonitoring() {
        this.stopLatencyMonitoring();
        this.latencyTimer = setInterval(() => {
            this.updateQuality();
        }, 1000);
    }
    /**
     * Stop latency monitoring
     */
    stopLatencyMonitoring() {
        if (this.latencyTimer) {
            clearInterval(this.latencyTimer);
            this.latencyTimer = undefined;
        }
    }
    /**
     * Add latency sample for averaging
     */
    addLatencySample(latency) {
        this.latencySamples.push(latency);
        // Keep last 20 samples
        if (this.latencySamples.length > 20) {
            this.latencySamples.shift();
        }
        this.updateLatencyStats();
        this.emit('latency', latency);
    }
    /**
     * Update latency statistics
     */
    updateLatencyStats() {
        if (this.latencySamples.length === 0)
            return;
        // Calculate average latency
        const sum = this.latencySamples.reduce((a, b) => a + b, 0);
        this._state.latency = Math.round(sum / this.latencySamples.length);
        // Calculate jitter (standard deviation)
        const mean = sum / this.latencySamples.length;
        const squaredDiffs = this.latencySamples.map(v => Math.pow(v - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
        this._state.jitter = Math.round(Math.sqrt(avgSquaredDiff));
    }
    /**
     * Update packet loss statistics
     */
    updatePacketLoss() {
        if (this.packetsSent === 0) {
            this._state.packetLoss = 0;
        }
        else {
            this._state.packetLoss = this.packetsLost / this.packetsSent;
        }
    }
    /**
     * Update connection quality assessment
     */
    updateQuality() {
        const oldQuality = this._state.quality;
        this._state.quality = this.assessQuality();
        if (oldQuality !== this._state.quality) {
            this.emit('quality_change', this._state.quality);
        }
    }
    /**
     * Assess connection quality based on metrics
     */
    assessQuality() {
        const { latency, jitter, packetLoss } = this._state;
        for (const [quality, thresholds] of Object.entries(QUALITY_THRESHOLDS)) {
            if (latency <= thresholds.maxLatency &&
                jitter <= thresholds.maxJitter &&
                packetLoss <= thresholds.maxPacketLoss) {
                return quality;
            }
        }
        return 'critical';
    }
    /**
     * Manually measure latency
     */
    async measureLatency() {
        if (!this.socket?.connected) {
            return -1;
        }
        return new Promise((resolve) => {
            const start = Date.now();
            const pingId = start;
            const timeout = setTimeout(() => {
                resolve(-1);
            }, 5000);
            const handler = (id) => {
                if (id === pingId) {
                    clearTimeout(timeout);
                    this.socket.off('pong', handler);
                    const latency = Date.now() - start;
                    this.addLatencySample(latency);
                    resolve(latency);
                }
            };
            this.socket.on('pong', handler);
            this.socket.emit('ping', pingId);
        });
    }
    /**
     * Get current connection quality
     */
    getQuality() {
        return this._state.quality;
    }
    /**
     * Send a message through the socket
     */
    send(event, data) {
        if (this.socket?.connected) {
            this._state.bytesSent += JSON.stringify(data).length;
            this.packetsSent++;
            this.socket.emit(event, data);
        }
    }
    /**
     * Send a message and wait for response
     */
    async request(event, data, timeout = 5000) {
        if (!this.socket?.connected) {
            throw new Error('Not connected');
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, timeout);
            this.socket.emit(event, data, (response) => {
                clearTimeout(timer);
                resolve(response);
            });
        });
    }
    /**
     * Listen for events from server
     */
    on(event, handler) {
        if (this.socket) {
            this.socket.on(event, handler);
        }
        return super.on(event, handler);
    }
    /**
     * Remove event listener
     */
    off(event, handler) {
        if (this.socket) {
            this.socket.off(event, handler);
        }
        return super.off(event, handler);
    }
    /**
     * Join a Socket.IO room
     */
    joinRoom(roomId) {
        if (this.socket?.connected) {
            this.socket.emit('join_room', roomId);
        }
    }
    /**
     * Leave a Socket.IO room
     */
    leaveRoom(roomId) {
        if (this.socket?.connected) {
            this.socket.emit('leave_room', roomId);
        }
    }
    /**
     * Clean up resources
     */
    dispose() {
        this.disconnect();
        this.removeAllListeners();
        this.latencySamples = [];
        this.packetsSent = 0;
        this.packetsReceived = 0;
        this.packetsLost = 0;
    }
}
export default ConnectionManager;
