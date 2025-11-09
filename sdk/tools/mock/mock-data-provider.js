"use strict";
/**
 * Mock Data Provider
 *
 * Provides mock/sandbox data for door development and testing.
 * Allows doors to be developed and tested without a full BBS environment.
 *
 * @example
 * ```typescript
 * import { MockDataProvider } from '@amiexpress/bbs-door-sdk/tools/mock';
 *
 * const mockData = new MockDataProvider();
 *
 * // Simulate user connection
 * door.start();
 * mockData.simulateUserConnect(door, {
 *   name: 'TestUser',
 *   securityLevel: 100
 * });
 * ```
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMockDevelopment = exports.MockDataProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Mock Data Provider for Door Development
 */
class MockDataProvider {
    constructor(config = {}) {
        this.mockUsers = new Map();
        this.nextUserId = 1;
        this.mockFS = new Map();
        this.config = {
            dataDir: config.dataDir || path.join(process.cwd(), '.mock-data'),
            autoConnect: config.autoConnect ?? true,
            defaultUser: config.defaultUser || {},
            enableMockFS: config.enableMockFS ?? true,
            verbose: config.verbose ?? false,
        };
        // Ensure mock data directory exists
        if (!fs.existsSync(this.config.dataDir)) {
            fs.mkdirSync(this.config.dataDir, { recursive: true });
        }
        this.log('Mock Data Provider initialized', { dataDir: this.config.dataDir });
    }
    /**
     * Create a mock user with default or custom properties
     */
    createMockUser(options = {}) {
        const id = options.id || this.nextUserId++;
        const user = {
            id,
            name: options.name || `User${id}`,
            securityLevel: options.securityLevel ?? 50,
            node: options.node ?? 1,
            timeLeft: options.timeLeft ?? 60,
            graphicsMode: options.graphicsMode || 'ANSI',
            termWidth: options.termWidth ?? 80,
            termHeight: options.termHeight ?? 24,
            data: options.data || {
                realName: options.realName || `Test User ${id}`,
                location: options.location || 'Test City, USA',
                uploads: options.uploads ?? 0,
                downloads: options.downloads ?? 0,
                posts: options.posts ?? 0,
                lastCall: options.lastCall || new Date(),
                flags: options.flags || [],
            },
        };
        this.mockUsers.set(id, user);
        this.log('Created mock user', user);
        return user;
    }
    /**
     * Simulate a user connecting to the door
     */
    simulateUserConnect(door, options = {}) {
        const user = this.createMockUser({
            ...this.config.defaultUser,
            ...options,
        });
        // Trigger the door's onConnect handler
        setTimeout(() => {
            door.emit('connect', user);
            this.log(`Simulated user ${user.name} (#${user.id}) connecting`);
        }, 100);
        return user;
    }
    /**
     * Simulate user input (keyboard)
     */
    simulateInput(door, userId, key) {
        const user = this.mockUsers.get(userId);
        if (!user) {
            console.error(`Mock user ${userId} not found`);
            return;
        }
        door.emit('input', user, { key, timestamp: Date.now() });
        this.log(`Simulated input from user ${user.name}: ${key}`);
    }
    /**
     * Simulate user disconnecting
     */
    simulateDisconnect(door, userId) {
        const user = this.mockUsers.get(userId);
        if (!user) {
            console.error(`Mock user ${userId} not found`);
            return;
        }
        door.emit('disconnect', user);
        this.log(`Simulated user ${user.name} disconnecting`);
    }
    /**
     * Get mock file path (sandboxed to mock data directory)
     */
    getMockFilePath(filename) {
        // Security: prevent path traversal
        const safeName = path.basename(filename);
        return path.join(this.config.dataDir, safeName);
    }
    /**
     * Read mock file
     */
    readMockFile(filename) {
        if (!this.config.enableMockFS) {
            throw new Error('Mock file system is disabled');
        }
        // Try memory cache first
        if (this.mockFS.has(filename)) {
            return this.mockFS.get(filename);
        }
        // Try disk
        const filePath = this.getMockFilePath(filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            this.mockFS.set(filename, content);
            this.log(`Read mock file: ${filename}`);
            return content;
        }
        return null;
    }
    /**
     * Write mock file
     */
    writeMockFile(filename, content) {
        if (!this.config.enableMockFS) {
            throw new Error('Mock file system is disabled');
        }
        this.mockFS.set(filename, content);
        const filePath = this.getMockFilePath(filename);
        fs.writeFileSync(filePath, content, 'utf8');
        this.log(`Wrote mock file: ${filename}`);
    }
    /**
     * Delete mock file
     */
    deleteMockFile(filename) {
        if (!this.config.enableMockFS) {
            throw new Error('Mock file system is disabled');
        }
        this.mockFS.delete(filename);
        const filePath = this.getMockFilePath(filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            this.log(`Deleted mock file: ${filename}`);
        }
    }
    /**
     * List all mock files
     */
    listMockFiles() {
        if (!this.config.enableMockFS) {
            return [];
        }
        return fs.readdirSync(this.config.dataDir);
    }
    /**
     * Clear all mock data
     */
    clearAll() {
        this.mockUsers.clear();
        this.mockFS.clear();
        this.nextUserId = 1;
        // Clear disk storage
        const files = fs.readdirSync(this.config.dataDir);
        for (const file of files) {
            fs.unlinkSync(path.join(this.config.dataDir, file));
        }
        this.log('Cleared all mock data');
    }
    /**
     * Get all mock users
     */
    getMockUsers() {
        return Array.from(this.mockUsers.values());
    }
    /**
     * Get mock user by ID
     */
    getMockUser(userId) {
        return this.mockUsers.get(userId);
    }
    /**
     * Set up auto-connect for development
     * Automatically connects a mock user when door starts
     */
    setupAutoConnect(door, options = {}) {
        door.once('start', () => {
            this.log('Auto-connecting mock user on door start');
            this.simulateUserConnect(door, options);
        });
    }
    /**
     * Create a development session with mock user and auto-cleanup
     *
     * @example
     * ```typescript
     * const mockData = new MockDataProvider();
     * mockData.createDevSession(door, {
     *   name: 'DevUser',
     *   securityLevel: 255
     * });
     * ```
     */
    createDevSession(door, userOptions = {}) {
        const user = this.createMockUser(userOptions);
        // Auto-connect on start
        this.setupAutoConnect(door, { id: user.id });
        // Cleanup function
        const cleanup = () => {
            this.simulateDisconnect(door, user.id);
            this.mockUsers.delete(user.id);
            this.log('Development session cleaned up');
        };
        return { user, cleanup };
    }
    /**
     * Log message if verbose mode is enabled
     */
    log(message, data) {
        if (this.config.verbose) {
            const timestamp = new Date().toISOString();
            console.log(`[MockData ${timestamp}] ${message}`, data || '');
        }
    }
}
exports.MockDataProvider = MockDataProvider;
/**
 * Quick helper to set up mock data for development
 *
 * @example
 * ```typescript
 * import { setupMockDevelopment } from '@amiexpress/bbs-door-sdk/tools/mock';
 *
 * setupMockDevelopment(door, {
 *   name: 'TestUser',
 *   securityLevel: 100
 * });
 *
 * door.start();
 * ```
 */
function setupMockDevelopment(door, userOptions = {}, config = {}) {
    const mockData = new MockDataProvider({
        verbose: true,
        autoConnect: true,
        ...config,
    });
    mockData.setupAutoConnect(door, userOptions);
    return mockData;
}
exports.setupMockDevelopment = setupMockDevelopment;
