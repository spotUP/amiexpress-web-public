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

import { BBSUser } from '../../core/types';
import { Door } from '../../core/door-api';
import * as fs from 'fs';
import * as path from 'path';

export interface MockUserOptions {
  id?: number;
  name?: string;
  realName?: string;
  location?: string;
  securityLevel?: number;
  timeLeft?: number;
  uploads?: number;
  downloads?: number;
  posts?: number;
  lastCall?: Date;
  flags?: string[];
}

export interface MockDataProviderConfig {
  /** Directory for mock data storage */
  dataDir?: string;

  /** Auto-connect user on door start */
  autoConnect?: boolean;

  /** Default user options */
  defaultUser?: MockUserOptions;

  /** Enable mock file system */
  enableMockFS?: boolean;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Mock Data Provider for Door Development
 */
export class MockDataProvider {
  private config: Required<MockDataProviderConfig>;
  private mockUsers: Map<number, BBSUser> = new Map();
  private nextUserId: number = 1;
  private mockFS: Map<string, string> = new Map();

  constructor(config: MockDataProviderConfig = {}) {
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
  public createMockUser(options: MockUserOptions = {}): BBSUser {
    const id = options.id || this.nextUserId++;
    const user: BBSUser = {
      id,
      name: options.name || `User${id}`,
      realName: options.realName || `Test User ${id}`,
      location: options.location || 'Test City, USA',
      securityLevel: options.securityLevel ?? 50,
      timeLeft: options.timeLeft ?? 60,
      uploads: options.uploads ?? 0,
      downloads: options.downloads ?? 0,
      posts: options.posts ?? 0,
      lastCall: options.lastCall || new Date(),
      flags: options.flags || [],
    };

    this.mockUsers.set(id, user);
    this.log('Created mock user', user);
    return user;
  }

  /**
   * Simulate a user connecting to the door
   */
  public simulateUserConnect(door: Door, options: MockUserOptions = {}): BBSUser {
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
  public simulateInput(door: Door, userId: number, key: string): void {
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
  public simulateDisconnect(door: Door, userId: number): void {
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
  public getMockFilePath(filename: string): string {
    // Security: prevent path traversal
    const safeName = path.basename(filename);
    return path.join(this.config.dataDir, safeName);
  }

  /**
   * Read mock file
   */
  public readMockFile(filename: string): string | null {
    if (!this.config.enableMockFS) {
      throw new Error('Mock file system is disabled');
    }

    // Try memory cache first
    if (this.mockFS.has(filename)) {
      return this.mockFS.get(filename)!;
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
  public writeMockFile(filename: string, content: string): void {
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
  public deleteMockFile(filename: string): void {
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
  public listMockFiles(): string[] {
    if (!this.config.enableMockFS) {
      return [];
    }

    return fs.readdirSync(this.config.dataDir);
  }

  /**
   * Clear all mock data
   */
  public clearAll(): void {
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
  public getMockUsers(): BBSUser[] {
    return Array.from(this.mockUsers.values());
  }

  /**
   * Get mock user by ID
   */
  public getMockUser(userId: number): BBSUser | undefined {
    return this.mockUsers.get(userId);
  }

  /**
   * Set up auto-connect for development
   * Automatically connects a mock user when door starts
   */
  public setupAutoConnect(door: Door, options: MockUserOptions = {}): void {
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
  public createDevSession(
    door: Door,
    userOptions: MockUserOptions = {}
  ): { user: BBSUser; cleanup: () => void } {
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
  private log(message: string, data?: any): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[MockData ${timestamp}] ${message}`, data || '');
    }
  }
}

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
export function setupMockDevelopment(
  door: Door,
  userOptions: MockUserOptions = {},
  config: MockDataProviderConfig = {}
): MockDataProvider {
  const mockData = new MockDataProvider({
    verbose: true,
    autoConnect: true,
    ...config,
  });

  mockData.setupAutoConnect(door, userOptions);

  return mockData;
}
