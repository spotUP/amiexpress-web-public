/**
 * Security Module
 *
 * Anti-cheat and input validation with:
 * - Server-side input validation
 * - Rate limiting
 * - Movement validation (speed hacks)
 * - Action validation (cooldowns, resources)
 * - Checksum verification
 * - Anomaly detection
 * - Report system
 */
import { EventEmitter } from 'events';
// Default security configuration
const DEFAULT_CONFIG = {
    serverValidation: true,
    clientValidation: true,
    rateLimiting: {
        enabled: true,
        maxInputsPerSecond: 60,
        maxMessagesPerSecond: 10,
        maxBytesPerSecond: 10000,
        burstLimit: 100,
    },
    movementValidation: {
        enabled: true,
        maxSpeed: 100,
        maxAcceleration: 200,
        tolerance: 1.1, // 10% tolerance
        teleportThreshold: 50,
    },
    actionValidation: {
        enabled: true,
        validateCooldowns: true,
        validateResources: true,
        validateRange: true,
    },
    encryption: {
        enabled: false,
        algorithm: 'aes-256-gcm',
        keyExchange: 'ecdh',
    },
    anticheat: {
        enabled: true,
        checksumValidation: true,
        speedHackDetection: true,
        wallhackDetection: false,
        aimAssistDetection: false,
        reportThreshold: 5,
    },
};
/**
 * Security Manager
 *
 * Provides anti-cheat measures and input validation for multiplayer games.
 * Note: This is primarily for client-side validation hints. Real security
 * MUST be implemented server-side.
 */
export class SecurityManager extends EventEmitter {
    constructor(connection, config = {}) {
        super();
        this.name = 'security';
        this.inputCounts = new Map();
        this.messageCounts = new Map();
        this.lastPositions = new Map();
        this.actionTrackers = new Map();
        this.checksums = new Map();
        this.violations = new Map();
        this.connection = connection;
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
        this.setupEventHandlers();
    }
    mergeConfig(defaults, overrides) {
        return {
            ...defaults,
            ...overrides,
            rateLimiting: { ...defaults.rateLimiting, ...overrides.rateLimiting },
            movementValidation: { ...defaults.movementValidation, ...overrides.movementValidation },
            actionValidation: { ...defaults.actionValidation, ...overrides.actionValidation },
            encryption: { ...defaults.encryption, ...overrides.encryption },
            anticheat: { ...defaults.anticheat, ...overrides.anticheat },
        };
    }
    /**
     * Initialize security manager
     */
    async init() {
        // Nothing to initialize
    }
    /**
     * Configure security manager
     */
    configure(config) {
        this.config = this.mergeConfig(this.config, config);
    }
    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        const socket = this.connection.getSocket();
        if (!socket)
            return;
        socket.on('security:violation', (data) => {
            this.recordViolation(data.playerId, data.severity);
            this.emit('violation', data);
        });
        socket.on('security:kick', (data) => {
            this.emit('kicked', data.reason);
        });
        socket.on('security:ban', (data) => {
            this.emit('banned', data.reason, data.duration);
        });
    }
    /**
     * Validate player input
     */
    validateInput(playerId, input) {
        if (!this.config.serverValidation) {
            return { valid: true };
        }
        // Rate limiting check
        if (this.config.rateLimiting.enabled) {
            const rateResult = this.checkInputRateLimit(playerId);
            if (!rateResult.valid) {
                return rateResult;
            }
        }
        // Basic input validation
        if (!this.isValidInput(input)) {
            return {
                valid: false,
                reason: 'Invalid input format',
                severity: 'warning',
            };
        }
        return { valid: true };
    }
    /**
     * Validate player movement
     */
    validateMovement(playerId, from, to, deltaTime) {
        if (!this.config.movementValidation.enabled) {
            return { valid: true };
        }
        // Calculate distance and speed
        const distance = this.vectorDistance(from, to);
        const speed = distance / (deltaTime / 1000); // Speed in units/second
        const maxSpeed = this.config.movementValidation.maxSpeed * this.config.movementValidation.tolerance;
        if (speed > maxSpeed) {
            this.recordViolation(playerId, 'violation');
            return {
                valid: false,
                reason: `Speed exceeded: ${speed.toFixed(2)} > ${maxSpeed.toFixed(2)}`,
                severity: 'violation',
            };
        }
        // Check for teleportation (instant position change)
        const lastPos = this.lastPositions.get(playerId);
        if (lastPos) {
            const timeSinceLast = Date.now() - lastPos.timestamp;
            const distFromLast = this.vectorDistance(lastPos.position, from);
            // If too much distance covered in too little time
            if (timeSinceLast > 0 && timeSinceLast < 1000) {
                const avgSpeed = distFromLast / (timeSinceLast / 1000);
                if (avgSpeed > maxSpeed * 2) {
                    this.recordViolation(playerId, 'critical');
                    return {
                        valid: false,
                        reason: 'Possible teleport detected',
                        severity: 'critical',
                    };
                }
            }
        }
        // Update last known position
        this.lastPositions.set(playerId, { position: to, timestamp: Date.now() });
        return { valid: true };
    }
    /**
     * Validate action (cooldowns, resources)
     */
    validateAction(playerId, action, data) {
        if (!this.config.actionValidation.enabled) {
            return { valid: true };
        }
        const tracker = this.actionTrackers.get(`${playerId}:${action}`);
        if (tracker && this.config.actionValidation.validateCooldowns) {
            // Check cooldown
            const elapsed = Date.now() - tracker.lastUsed;
            if (elapsed < tracker.cooldown) {
                return {
                    valid: false,
                    reason: `Action on cooldown: ${(tracker.cooldown - elapsed) / 1000}s remaining`,
                    severity: 'warning',
                };
            }
            // Check max uses
            if (tracker.maxUses !== undefined && tracker.uses >= tracker.maxUses) {
                return {
                    valid: false,
                    reason: 'Maximum uses reached',
                    severity: 'warning',
                };
            }
        }
        // Check resource cost if provided in data
        if (data && this.config.actionValidation.validateResources) {
            if (data.resourceCost !== undefined && data.currentResources !== undefined) {
                if (data.currentResources < data.resourceCost) {
                    return {
                        valid: false,
                        reason: `Insufficient resources: ${data.currentResources} < ${data.resourceCost}`,
                        severity: 'warning',
                    };
                }
            }
        }
        return { valid: true };
    }
    /**
     * Register an action with cooldown
     */
    registerAction(playerId, action, cooldown, maxUses) {
        const key = `${playerId}:${action}`;
        const tracker = this.actionTrackers.get(key);
        if (tracker) {
            tracker.lastUsed = Date.now();
            tracker.uses++;
        }
        else {
            this.actionTrackers.set(key, {
                lastUsed: Date.now(),
                cooldown,
                uses: 1,
                maxUses,
            });
        }
    }
    /**
     * Reset action cooldown
     */
    resetAction(playerId, action) {
        const key = `${playerId}:${action}`;
        this.actionTrackers.delete(key);
    }
    /**
     * Check message rate limit
     */
    checkMessageRateLimit(playerId) {
        if (!this.config.rateLimiting.enabled) {
            return { valid: true };
        }
        const now = Date.now();
        const counter = this.messageCounts.get(playerId);
        if (!counter || now - counter.windowStart >= 1000) {
            // New window
            this.messageCounts.set(playerId, { count: 1, windowStart: now });
            return { valid: true };
        }
        counter.count++;
        if (counter.count > this.config.rateLimiting.maxMessagesPerSecond) {
            this.recordViolation(playerId, 'warning');
            return {
                valid: false,
                reason: 'Message rate limit exceeded',
                severity: 'warning',
            };
        }
        return { valid: true };
    }
    /**
     * Verify state checksum
     */
    verifyChecksum(stateId, checksum) {
        const stored = this.checksums.get(stateId);
        if (!stored)
            return true; // No stored checksum to compare
        return stored === checksum;
    }
    /**
     * Store state checksum
     */
    storeChecksum(stateId, checksum) {
        this.checksums.set(stateId, checksum);
    }
    /**
     * Calculate checksum for state
     */
    calculateChecksum(state) {
        // Simple checksum - in production, use proper hash
        const json = JSON.stringify(state);
        let hash = 0;
        for (let i = 0; i < json.length; i++) {
            const char = json.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
    /**
     * Report a player for suspicious behavior
     */
    async reportPlayer(playerId, reason, description) {
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('security:report', { playerId, reason, description });
        }
        this.emit('report:sent', playerId, reason);
    }
    /**
     * Get violation count for player
     */
    getViolationCount(playerId) {
        return this.violations.get(playerId)?.count || 0;
    }
    /**
     * Get violation severity score for player
     */
    getViolationSeverity(playerId) {
        return this.violations.get(playerId)?.severity || 0;
    }
    /**
     * Clear violations for player
     */
    clearViolations(playerId) {
        this.violations.delete(playerId);
    }
    /**
     * Encrypt data
     */
    encrypt(data) {
        if (!this.config.encryption.enabled) {
            return JSON.stringify(data);
        }
        // Simple obfuscation - in production, use proper encryption
        const json = JSON.stringify(data);
        return Buffer.from(json).toString('base64');
    }
    /**
     * Decrypt data
     */
    decrypt(encrypted) {
        if (!this.config.encryption.enabled) {
            return JSON.parse(encrypted);
        }
        try {
            const json = Buffer.from(encrypted, 'base64').toString();
            return JSON.parse(json);
        }
        catch {
            return null;
        }
    }
    // Private helper methods
    checkInputRateLimit(playerId) {
        const now = Date.now();
        const counter = this.inputCounts.get(playerId);
        if (!counter || now - counter.windowStart >= 1000) {
            // New window
            this.inputCounts.set(playerId, { count: 1, windowStart: now });
            return { valid: true };
        }
        counter.count++;
        if (counter.count > this.config.rateLimiting.maxInputsPerSecond) {
            this.recordViolation(playerId, 'warning');
            return {
                valid: false,
                reason: 'Input rate limit exceeded',
                severity: 'warning',
            };
        }
        return { valid: true };
    }
    isValidInput(input) {
        if (!input || typeof input !== 'object')
            return false;
        // Validate tick and timestamp
        if (typeof input.tick !== 'number' || typeof input.timestamp !== 'number')
            return false;
        // Validate keys if present
        if (input.keys && typeof input.keys !== 'object')
            return false;
        // Validate mouse if present
        if (input.mouse) {
            if (typeof input.mouse.x !== 'number' || typeof input.mouse.y !== 'number')
                return false;
        }
        // Validate actions if present
        if (input.actions && !Array.isArray(input.actions))
            return false;
        return true;
    }
    vectorDistance(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = (b.z || 0) - (a.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    recordViolation(playerId, severity) {
        const existing = this.violations.get(playerId) || { count: 0, severity: 0 };
        const severityScore = severity === 'warning' ? 1 : severity === 'violation' ? 3 : 10;
        this.violations.set(playerId, {
            count: existing.count + 1,
            severity: existing.severity + severityScore,
        });
        // Emit warning if severity threshold exceeded
        if (existing.severity + severityScore >= this.config.anticheat.reportThreshold) {
            this.emit('player:suspicious', playerId, existing.count + 1, existing.severity + severityScore);
        }
    }
    /**
     * Dispose of security manager
     */
    dispose() {
        this.inputCounts.clear();
        this.messageCounts.clear();
        this.lastPositions.clear();
        this.actionTrackers.clear();
        this.checksums.clear();
        this.violations.clear();
        this.removeAllListeners();
    }
}
export default SecurityManager;
