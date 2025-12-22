/**
 * Unified BBS API for All Door Types
 *
 * This module provides a comprehensive BBS API that gives TypeScript, Python, and ARexx doors
 * the same capabilities that native 68k Amiga doors have through the library system.
 *
 * Native Amiga doors access these functions through:
 * - AEDoorLibrary: BBS-specific functions (GetDT, WriteStr, Prompt, etc.)
 * - DosLibrary: File I/O (Open, Close, Read, Write, etc.)
 * - ExecLibrary: Memory, ports, messages
 *
 * This API exposes equivalent functionality in a modern JavaScript/TypeScript interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { convertPetsciiToPetMe64 } from '../utils/petscii.util';

export interface BBSUser {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;
  secLevel: number;
  downloads?: number;
  uploads?: number;
  timeToday?: number;
  lastCall?: Date;
  numCalls?: number;
  birthday?: string;
  gender?: string;
}

export interface BBSConference {
  id: number;
  name: string;
  description?: string;
  accessLevel: number;
}

export interface BBSNode {
  nodeId: number;
  username?: string;
  location?: string;
  activity?: string;
  online: boolean;
}

export interface BBSSystemInfo {
  bbsName: string;
  sysopName: string;
  version: string;
  nodes: number;
}

/**
 * Main BBS API class
 * Provides all functions that doors need to interact with the BBS
 */
export class BBSApi {
  private socket: Socket;
  private session: BBSSession;
  private inputCallback?: (input: string) => void;
  private boundSocketHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  constructor(socket: Socket, session: BBSSession) {
    this.socket = socket;
    this.session = session;
  }

  setSocket(socket: Socket): void {
    if (this.socket === socket) return;

    for (const { event, handler } of this.boundSocketHandlers) {
      this.socket.off(event, handler);
    }

    this.socket = socket;

    for (const { event, handler } of this.boundSocketHandlers) {
      this.socket.on(event, handler);
    }
  }

  private bindSocketEvent(event: string, handler: (...args: any[]) => void): void {
    this.boundSocketHandlers.push({ event, handler });
    this.socket.on(event, handler);
  }

  // ========================================
  // OUTPUT FUNCTIONS (like AEDoor WriteStr)
  // ========================================

  /**
   * Write text to user's terminal
   * Equivalent to AEDoor WriteStr() function
   */
  write(text: string): void {
    this.socket.emit('ansi-output', text);
  }

  /**
   * Write text with newline
   */
  writeLine(text: string): void {
    this.socket.emit('ansi-output', text + '\r\n');
  }

  /**
   * Clear screen
   */
  clearScreen(): void {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
  }

  /**
   * Move cursor to position (1-indexed like Amiga)
   */
  moveCursor(row: number, col: number): void {
    this.socket.emit('ansi-output', `\x1b[${row};${col}H`);
  }

  /**
   * Set ANSI color
   */
  setColor(colorCode: number): void {
    this.socket.emit('ansi-output', `\x1b[${colorCode}m`);
  }

  // ========================================
  // PETSCII OUTPUT FUNCTIONS (for C64 mode)
  // ========================================

  /**
   * Check if session is in PETSCII mode (C64 terminal)
   * When true, doors should use 40x25 layout and PETSCII output
   */
  isPetsciiMode(): boolean {
    return this.session?.petsciiMode === true;
  }

  /**
   * Get terminal dimensions (40x25 for PETSCII, 80x24 for ANSI)
   */
  getTerminalSize(): { width: number; height: number } {
    return {
      width: this.session?.screenWidth || 80,
      height: this.session?.screenHeight || 24
    };
  }

  /**
   * Write PETSCII content to terminal
   * Emits 'petscii-output' event which triggers PetMe64 font on frontend
   * For real C64 terminals, this is converted to raw PETSCII bytes
   *
   * @param data String (already in Unicode PUA format) or Buffer (raw PETSCII bytes)
   */
  writePetscii(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      // Convert raw PETSCII bytes to Unicode PUA for PetMe64 font
      const converted = convertPetsciiToPetMe64(data);
      this.socket.emit('petscii-output', converted);
    } else {
      // Already a string - send directly
      this.socket.emit('petscii-output', data);
    }
  }

  /**
   * Write PETSCII content with newline
   */
  writePetsciiLine(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      const converted = convertPetsciiToPetMe64(data);
      this.socket.emit('petscii-output', converted + '\r\n');
    } else {
      this.socket.emit('petscii-output', data + '\r\n');
    }
  }

  /**
   * Auto-detect mode and write appropriate output
   * Use this when you have both ANSI and PETSCII versions of content
   *
   * @param ansiText Text/ANSI output for modern terminals
   * @param petsciiData PETSCII output for C64 terminals (optional, falls back to ANSI)
   */
  writeAuto(ansiText: string, petsciiData?: string | Buffer): void {
    if (this.isPetsciiMode() && petsciiData !== undefined) {
      this.writePetscii(petsciiData);
    } else {
      this.write(ansiText);
    }
  }

  /**
   * Clear screen - auto-detects PETSCII vs ANSI mode
   */
  clearScreenAuto(): void {
    if (this.isPetsciiMode()) {
      // PETSCII clear screen: CHR$(147) = 0x93
      this.writePetscii(Buffer.from([0x93]));
    } else {
      this.clearScreen();
    }
  }

  // ========================================
  // INPUT FUNCTIONS (like AEDoor Prompt)
  // ========================================

  /**
   * Get line of input from user with optional prompt
   * Equivalent to AEDoor Prompt() function
   * Buffers input until Enter is pressed
   *
   * @param prompt Text to display before input
   * @param maxLength Maximum input length (default 255)
   * @returns Promise that resolves with user's input
   */
  async getLine(prompt?: string, maxLength: number = 255): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      let buffer = '';

      const handler = (input: string) => {
        // Handle each character
        for (let i = 0; i < input.length; i++) {
          const ch = input.charAt(i);
          const code = input.charCodeAt(i);

          // Enter key - submit line
          if (ch === '\r' || ch === '\n') {
            delete this.session.doorInputHandler;
            resolve(buffer);
            return;
          }

          // Backspace - delete last character
          if (code === 127 || code === 8) {
            if (buffer.length > 0) {
              buffer = buffer.substring(0, buffer.length - 1);
              // Send backspace sequence: move left, space, move left
              this.socket.emit('ansi-output', '\b \b');
            }
            continue;
          }

          // Regular character - add to buffer if printable and under max length
          if (code >= 32 && code <= 126 && buffer.length < maxLength) {
            buffer += ch;
            // Echo character
            this.socket.emit('ansi-output', ch);
          }
        }
      };

      // Register handler in session
      this.session.doorInputHandler = handler;
    });
  }

  /**
   * Get single keypress from user
   * Equivalent to AEDoor GetKey() function
   */
  async getKey(prompt?: string): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      const handler = (input: string) => {
        delete this.session.doorInputHandler;
        resolve(input.charAt(0)); // Return first character only
      };

      this.session.doorInputHandler = handler;
    });
  }

  // ========================================
  // GAME MODE INPUT (real-time key tracking)
  // ========================================

  /**
   * Enable game mode for real-time keyboard input
   * When enabled:
   * - Frontend sends raw keydown/keyup events (no OS key repeat delay)
   * - Multiple keys can be held simultaneously
   * - Use isKeyPressed() to check key states
   * - Use onKeyDown/onKeyUp for event callbacks
   */
  enableGameMode(): void {
    this.socket.emit('game-mode', true);
    console.log('[BBSApi] Game mode enabled');
  }

  /**
   * Disable game mode and return to normal input
   */
  disableGameMode(): void {
    this.socket.emit('game-mode', false);
    // Clear key state
    if (this.session.keyState) {
      this.session.keyState = {};
    }
    console.log('[BBSApi] Game mode disabled');
  }

  /**
   * Check if a key is currently pressed (game mode only)
   * @param key Key to check (e.g., 'ArrowLeft', 'a', 'space')
   */
  isKeyPressed(key: string): boolean {
    return this.session.keyState?.[key] === true;
  }

  /**
   * Get all currently pressed keys (game mode only)
   */
  getPressedKeys(): string[] {
    if (!this.session.keyState) return [];
    return Object.keys(this.session.keyState).filter(k => this.session.keyState![k]);
  }

  /**
   * Register callback for keydown events (game mode only)
   * Callback receives key name and full keyState object
   */
  onKeyDown(callback: (key: string, keyState: Record<string, boolean>) => void): void {
    const handler = (data: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => {
      if (data.pressed) {
        callback(data.key, data.keyState);
      }
    };
    this.session.doorKeyStateHandler = handler;
  }

  /**
   * Register callback for keyup events (game mode only)
   * Callback receives key name and full keyState object
   */
  onKeyUp(callback: (key: string, keyState: Record<string, boolean>) => void): void {
    const existingHandler = this.session.doorKeyStateHandler;
    const newHandler = (data: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => {
      if (!data.pressed) {
        callback(data.key, data.keyState);
      }
      // Call existing handler if present (for onKeyDown)
      if (existingHandler && data.pressed) {
        existingHandler(data);
      }
    };
    this.session.doorKeyStateHandler = newHandler;
  }

  /**
   * Register callback for all key events (both down and up)
   * More efficient than separate onKeyDown/onKeyUp calls
   */
  onKeyEvent(callback: (key: string, pressed: boolean, keyState: Record<string, boolean>) => void): void {
    this.session.doorKeyStateHandler = (data: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => {
      callback(data.key, data.pressed, data.keyState);
    };
  }

  /**
   * Display menu and get hotkey choice
   * Returns the key pressed (uppercase)
   */
  async hotkey(options: string[], prompt?: string): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      const handler = (input: string) => {
        delete this.session.doorInputHandler;
        const key = input.charAt(0).toUpperCase();
        resolve(key);
      };

      this.session.doorInputHandler = handler;
    });
  }

  // ========================================
  // USER DATA FUNCTIONS (like AEDoor GetDT)
  // ========================================

  /**
   * Get current user information
   * Equivalent to AEDoor GetDT() function with DT_NAME, DT_LOCATION, etc.
   */
  getUser(): BBSUser | null {
    if (!this.session.user) return null;

    return {
      id: this.session.user.id,
      username: this.session.user.username,
      realname: this.session.user.realname,
      location: this.session.user.location,
      phone: this.session.user.phone,
      email: this.session.user.email,
      secLevel: this.session.user.secLevel || 0,
      downloads: this.session.user.downloads || 0,
      uploads: this.session.user.uploads || 0,
      timeToday: this.session.user.timeToday || 0,
      lastCall: this.session.user.lastCall,
      numCalls: this.session.user.numCalls || 0,
      birthday: this.session.user.birthday,
      gender: this.session.user.gender
    };
  }

  /**
   * Get user's security level
   */
  getUserSecLevel(): number {
    return this.session.user?.secLevel || 0;
  }

  /**
   * Get user's time remaining (in minutes)
   */
  getTimeRemaining(): number {
    return this.session.timeRemaining || 60;
  }

  /**
   * Get time user has been online (in minutes)
   */
  getTimeOnline(): number {
    if (!this.session.loginTime) return 0;
    return Math.floor((Date.now() - this.session.loginTime) / 60000);
  }

  // ========================================
  // CONFERENCE FUNCTIONS
  // ========================================

  /**
   * Get current conference number
   */
  getCurrentConference(): number {
    return this.session.currentConf || 1;
  }

  /**
   * Get current conference name
   */
  getCurrentConferenceName(): string {
    return this.session.currentConfName || 'Main';
  }

  /**
   * Join a conference by number
   */
  async joinConference(confNum: number): Promise<boolean> {
    // TODO: Implement conference join logic
    // For now, just update session
    this.session.currentConf = confNum;
    return true;
  }

  /**
   * List available conferences
   */
  async listConferences(): Promise<BBSConference[]> {
    // TODO: Query database for conferences
    return [];
  }

  // ========================================
  // NODE/SYSTEM FUNCTIONS
  // ========================================

  /**
   * Get current node number
   */
  getNodeNumber(): number {
    return this.session.nodeId || 1;
  }

  /**
   * Get BBS system information
   */
  getSystemInfo(): BBSSystemInfo {
    return {
      bbsName: 'AmiExpress-Web',
      sysopName: 'Sysop',
      version: '2.x',
      nodes: 8
    };
  }

  /**
   * Get information about all nodes (for WHO doors)
   */
  async getNodes(): Promise<BBSNode[]> {
    // TODO: Query active sessions
    return [
      {
        nodeId: this.getNodeNumber(),
        username: this.session.user?.username,
        location: 'In door',
        activity: 'Running door',
        online: true
      }
    ];
  }

  // ========================================
  // FILE I/O FUNCTIONS (like DOS.library)
  // ========================================

  /**
   * Read text file and return contents
   * Equivalent to DOS Open()/Read()/Close()
   *
   * @param filename Path relative to BBS root or absolute
   * @returns File contents as string, or null if error
   */
  async readFile(filename: string): Promise<string | null> {
    try {
      // Resolve path relative to BBS data directory
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      const content = amigafs.readFileSync(fullPath, 'utf8');
      return content.toString();
    } catch (error) {
      console.error(`[BBSApi] Error reading file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Write text to file
   * Equivalent to DOS Open()/Write()/Close()
   */
  async writeFile(filename: string, content: string): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      amigafs.writeFileSync(fullPath, content, 'utf8');
      return true;
    } catch (error) {
      console.error(`[BBSApi] Error writing file ${filename}:`, error);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename: string): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      return amigafs.existsSync(fullPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * List files in directory
   * Equivalent to DOS ExAll()
   */
  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(directory)
        ? directory
        : path.join(bbsRoot, directory);

      const files = amigafs.readdirSync(fullPath);

      // Apply pattern filter if provided (simple glob matching)
      if (pattern) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
          'i'
        );
        return files.filter(f => regex.test(f));
      }

      return files;
    } catch (error) {
      console.error(`[BBSApi] Error listing directory ${directory}:`, error);
      return [];
    }
  }

  // ========================================
  // MESSAGE FUNCTIONS
  // ========================================

  /**
   * Send private message to another user
   * Equivalent to AEDoor JH_PM command
   */
  async sendMessage(toUsername: string, subject: string, body: string): Promise<boolean> {
    // TODO: Implement message sending via database
    console.log(`[BBSApi] Sending message to ${toUsername}: ${subject}`);
    return true;
  }

  /**
   * Post message to current conference
   * Equivalent to AEDoor JH_SM command
   */
  async postMessage(subject: string, body: string): Promise<boolean> {
    // TODO: Implement conference message posting
    console.log(`[BBSApi] Posting message to conference ${this.getCurrentConference()}: ${subject}`);
    return true;
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Log to caller's activity log
   * Equivalent to express.e callersLog() function
   */
  async logActivity(action: string, details?: string): Promise<void> {
    const { callersLogManager } = require('../services/CallersLogManager');
    const nodeId = this.getNodeNumber();
    callersLogManager.logActivity(nodeId, action, details);
  }

  /**
   * Display ANSI file to user
   * Equivalent to express.e ShowGFile() function
   */
  async displayFile(filename: string): Promise<boolean> {
    const content = await this.readFile(filename);
    if (content) {
      this.write(content);
      return true;
    }
    return false;
  }

  /**
   * Pause for user keypress
   */
  async pause(prompt: string = '\r\n\x1b[32mPress any key to continue...\x1b[0m'): Promise<void> {
    await this.getKey(prompt);
  }

  /**
   * Display text with MCI codes processed
   * Equivalent to express.e processMci() function
   */
  displayMCI(text: string): void {
    const { parseMciCodes, addAnsiEscapes } = require('../handlers/screen.handler');

    let processed = parseMciCodes(text, this.session);
    processed = addAnsiEscapes(processed);
    processed = processed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    this.write(processed);
  }

  // ========================================
  // DATABASE FUNCTIONS
  // ========================================

  /**
   * Execute SQL query (for advanced doors)
   * Restricted by user security level
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    // Only allow for high security users
    if (this.getUserSecLevel() < 100) {
      throw new Error('Database access requires security level 100+');
    }

    const { db } = require('../database/Database');
    const result = await db.query(sql, params);
    return result.rows;
  }

  // ========================================
  // CHAT ROOM FUNCTIONS (for LiveChat door)
  // ========================================

  /**
   * Join a chat room
   * Calls the handler directly instead of socket emit
   * Note: setGroupChatDependencies is called at server startup in index.ts
   */
  async joinRoom(roomName: string, password?: string): Promise<{ success: boolean; roomId?: string; roomName?: string; memberCount?: number; members?: any[]; error?: string }> {
    try {
      const { handleRoomJoin } = require('../handlers/chat/group-chat.handler');

      // Create a response collector
      let response: any = null;
      const originalEmit = this.socket.emit.bind(this.socket);

      // Intercept the room:joined event
      this.socket.emit = ((event: string, ...args: any[]) => {
        if (event === 'room:joined') {
          response = args[0];
        }
        return originalEmit(event, ...args);
      }) as any;

      // Call handler directly
      await handleRoomJoin(this.socket, this.session, { roomName, password });

      // Restore original emit
      this.socket.emit = originalEmit;

      if (response) {
        return {
          success: true,
          roomId: response.roomId,
          roomName: response.roomName,
          memberCount: response.memberCount,
          members: response.members
        };
      }

      return { success: false, error: 'Failed to join room' };
    } catch (error) {
      console.error('[BBSApi] Error joining room:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Leave the current chat room
   */
  async leaveRoom(): Promise<boolean> {
    try {
      const { handleRoomLeave } = require('../handlers/chat/group-chat.handler');
      await handleRoomLeave(this.socket, this.session);
      return true;
    } catch (error) {
      console.error('[BBSApi] Error leaving room:', error);
      return false;
    }
  }

  /**
   * Send a message to the current chat room
   */
  async sendRoomMessage(message: string): Promise<boolean> {
    try {
      const { handleRoomMessage } = require('../handlers/chat/group-chat.handler');
      await handleRoomMessage(this.socket, this.session, { message });
      return true;
    } catch (error) {
      console.error('[BBSApi] Error sending room message:', error);
      return false;
    }
  }

  /**
   * Create a new chat room
   */
  async createRoom(roomName: string, options?: { topic?: string; isPublic?: boolean; password?: string; maxUsers?: number }): Promise<{ success: boolean; roomId?: string; error?: string }> {
    try {
      const { handleRoomCreate } = require('../handlers/chat/group-chat.handler');

      let response: any = null;
      const originalEmit = this.socket.emit.bind(this.socket);

      this.socket.emit = ((event: string, ...args: any[]) => {
        if (event === 'room:created') {
          response = args[0];
        }
        return originalEmit(event, ...args);
      }) as any;

      await handleRoomCreate(this.socket, this.session, {
        roomName,
        topic: options?.topic,
        isPublic: options?.isPublic,
        password: options?.password,
        maxUsers: options?.maxUsers
      });

      this.socket.emit = originalEmit;

      if (response) {
        return { success: true, roomId: response.roomId };
      }

      return { success: false, error: 'Failed to create room' };
    } catch (error) {
      console.error('[BBSApi] Error creating room:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * List available chat rooms
   */
  async listRooms(showPrivate?: boolean): Promise<any[]> {
    try {
      const { db } = require('../database');
      const rooms = await db.listChatRooms(!showPrivate);
      return rooms || [];
    } catch (error) {
      console.error('[BBSApi] Error listing rooms:', error);
      return [];
    }
  }

  /**
   * Get current room ID from session
   */
  getCurrentRoomId(): string | undefined {
    return this.session.currentRoomId;
  }

  /**
   * Get current room name from session
   */
  getCurrentRoomName(): string | undefined {
    return this.session.currentRoomName;
  }

  /**
   * Register handler for incoming chat messages
   * Note: This listens for messages FROM OTHER USERS in the room
   */
  onRoomMessage(callback: (msg: { userId: string; username: string; content: string; timestamp: Date }) => void): void {
    this.bindSocketEvent('chat:message', (data: any) => {
      callback({
        userId: data.userId,
        username: data.username,
        content: data.content,
        timestamp: new Date(data.createdAt)
      });
    });
  }

  /**
   * Register handler for user join events
   */
  onUserJoined(callback: (data: { userId: number; username: string }) => void): void {
    this.bindSocketEvent('room:user-joined', callback);
  }

  /**
   * Register handler for user leave events
   */
  onUserLeft(callback: (data: { userId: number; username: string }) => void): void {
    this.bindSocketEvent('room:user-left', callback);
  }
}

/**
 * Create BBS API instance for a door session
 */
export function createBBSApi(socket: Socket, session: BBSSession): BBSApi {
  return new BBSApi(socket, session);
}
