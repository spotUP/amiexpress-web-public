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
import { AnsiUtil } from '../utils/ansi.util';
import { EventEmitter } from 'events';
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { convertPetsciiToPetMe64 } from '../utils/petscii.util';
import { db } from '../database';
import { getSystemTime } from '../utils/date-time.util';
import {
  enableGameMode as enableGameModeForSession,
  disableGameMode as disableGameModeForSession,
} from '../services/game-mode.service';

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

  // Internal event emitter for server-side events (like resize)
  // This is needed because socket.emit() sends to the client, not to server-side listeners
  private internalEmitter: EventEmitter = new EventEmitter();

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

  /**
   * Register an event handler
   * Used by doors to listen for events like screen:resize
   * Listens on BOTH socket (client->server) AND internal emitter (server-side)
   */
  on(event: string, handler: (...args: any[]) => void): void {
    // Listen on socket for client-originated events
    this.bindSocketEvent(event, handler);
    // Also listen on internal emitter for server-side events (like resize)
    this.internalEmitter.on(event, handler);
  }

  /**
   * Emit an event internally (server-side only)
   * Used by socket handlers to notify the door of events like resize
   */
  emitInternal(event: string, ...args: any[]): void {
    this.internalEmitter.emit(event, ...args);
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
    this.socket.emit('ansi-output', AnsiUtil.clearScreen());
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
   * Get terminal dimensions (40x25 for PETSCII, 80x25 for ANSI)
   */
  getTerminalSize(): { width: number; height: number } {
    return {
      width: this.session?.screenWidth || 80,
      height: this.session?.screenHeight || 25
    };
  }

  /**
   * Get connection type (web, telnet, or ssh)
   * Used by SDK helpers to determine if Unicode conversion is needed
   */
  get connectionType(): 'web' | 'telnet' | 'ssh' {
    return (this.session as any)?.connectionType || 'web';
  }

  /**
   * Check if terminal supports Unicode
   * - Web terminals: Always true (xterm.js supports Unicode)
   * - Telnet/SSH: Detected via TTYPE negotiation
   *   - Modern terminals (xterm, PuTTY, iTerm): true
   *   - Amiga terminals (Term, NComm): false
   *   - Unknown: defaults to false for safety
   */
  get unicodeCapable(): boolean {
    // Web always supports Unicode
    if (this.connectionType === 'web') {
      return true;
    }
    // For telnet/SSH, check detected capability (defaults to false if unknown)
    return (this.session as any)?.unicodeCapable === true;
  }

  /**
   * Check if modem emulation is enabled
   * When true, output is throttled character-by-character to simulate modem speeds
   * Used by blessed SDK to enable slow connection mode (differential rendering)
   */
  get modemEmulationEnabled(): boolean {
    return this.session?.modemEmulationEnabled === true;
  }

  /**
   * Get modem emulation speed in bps
   * 0 = disabled, otherwise simulated baud rate (300, 1200, 2400, 9600, etc.)
   */
  get modemBps(): number {
    if (!this.session?.modemEmulationEnabled) {
      return 0;
    }
    return this.session?.modemBps || this.session?.user?.baud || 0;
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
  enableGameMode(doorType: string = 'TS'): void {
    // Delegate so session.gameModeEnabled / currentDoorType track the emit.
    enableGameModeForSession(this.socket, this.session, doorType);
  }

  /**
   * Disable game mode and return to normal input
   */
  disableGameMode(): void {
    // Delegate so keyRepeatManager teardown + keyState reset happen too.
    disableGameModeForSession(this.socket, this.session);
  }

  /**
   * Enable mouse events for the door
   * When enabled, mouse clicks, movement, and wheel events are sent to the door
   * Required for neo-blessed and other UI frameworks that use mouse input
   */
  enableMouseEvents(): void {
    console.log('[BBSApi] enableMouseEvents() called, session:', typeof this.session, 'session.mouseEventsEnabled before:', this.session.mouseEventsEnabled);
    this.session.mouseEventsEnabled = true;
    console.log('[BBSApi] Mouse events enabled, session.mouseEventsEnabled after:', this.session.mouseEventsEnabled);
  }

  /**
   * Disable mouse events
   */
  disableMouseEvents(): void {
    this.session.mouseEventsEnabled = false;
console.log('[BBSApi] Mouse events disabled');
  }

  /**
   * Set terminal mode for responsive sizing
   * - 'fixed': 80 columns (default, for ANSI art compatibility)
   * - 'wide': responsive width (for neo-blessed doors that support wider layouts)
   */
  setTerminalMode(mode: 'fixed' | 'wide'): void {
    console.log(`[BBSApi] setTerminalMode called with mode=${mode}, socket.id=${this.socket.id}`);
    this.socket.emit('terminal-mode', mode);
    console.log(`[BBSApi] Emitted terminal-mode event with mode=${mode}`);
  }

  /**
   * Enable wide terminal mode (responsive width)
   * Call this at door startup if your door supports wider layouts
   */
  enableWideMode(): void {
    this.setTerminalMode('wide');
  }

  /**
   * Restore fixed 80-column terminal mode
   * Call this before door exit to restore normal BBS display
   */
  disableWideMode(): void {
    this.setTerminalMode('fixed');
  }

  /**
   * Set cursor style for mouse hover feedback (CSS cursor property)
   * Valid styles: 'default', 'pointer', 'text', 'move', 'grab', 'grabbing',
   *               'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
   *               'col-resize', 'row-resize', 'crosshair', 'not-allowed'
   */
  setCursorStyle(style: string): void {
    this.socket.emit('cursor-style', style);
  }

  // ===== Modem Emulation =====

  /**
   * Get current modem emulation speed in bps
   * Returns 0 if modem emulation is disabled (full speed)
   */
  getModemSpeed(): number {
    return (this.session as any).modemSpeed || 0;
  }

  /**
   * Set modem emulation speed
   * @param bps Baud rate (e.g., 2400, 9600, 14400). Use 0 to disable emulation (full speed)
   */
  setModemSpeed(bps: number): void {
    (this.session as any).modemSpeed = bps;

    // Update backend modem emulator (the one that wraps socket.emit)
    const { getModemEmulator } = require('../utils/modem-emulator.util');
    const modemEmulator = getModemEmulator(this.socket);
    if (bps > 0) {
      modemEmulator.enable(bps);
    } else {
      modemEmulator.disable();
    }

    // Notify frontend modem emulator as well
    this.socket.emit('modem-speed', bps);
  }

  /**
   * Disable modem emulation (full speed)
   */
  disableModemEmulation(): void {
    this.setModemSpeed(0);
  }

  /**
   * Check if modem emulation is active
   */
  isModemEmulationActive(): boolean {
    return this.getModemSpeed() > 0;
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
   * Get list of users (for autocomplete / directory UIs)
   */
  async getUserList(limit: number = 1000): Promise<BBSUser[]> {
    const users = await db.getUsers({ limit });
    return users.map((user: any) => ({
      id: user.id,
      username: user.username,
      realname: user.realname,
      location: user.location,
      phone: user.phone,
      email: user.email,
      secLevel: user.secLevel || 0,
      downloads: user.downloads || 0,
      uploads: user.uploads || 0,
      timeToday: user.timeToday || 0,
      lastCall: user.lastCall,
      numCalls: user.numCalls || 0,
      birthday: user.birthday,
      gender: user.gender,
    }));
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
    try {
      // Check if conference exists
      const conferences = await db.getConferences();
      const targetConf = conferences.find(c => c.id === confNum);

      if (!targetConf) {
console.warn(`[BBSApi] Conference ${confNum} not found`);
        return false;
      }

      // Check if user has access to this conference
      // In express.e, this is done via checkConfAccess() which checks confaccess string
      // For now, allow access (doors typically have their own access checks)

      // Update session
      this.session.currentConf = confNum;
      this.session.currentConfName = targetConf.name;

      return true;
    } catch (error) {
console.error('[BBSApi] Error joining conference:', error);
      return false;
    }
  }

  /**
   * List available conferences
   */
  async listConferences(): Promise<BBSConference[]> {
    try {
      const conferences = await db.getConferences();
      return conferences.map((conf: any) => ({
        id: conf.id,
        name: conf.name,
        description: conf.description || '',
        accessLevel: conf.accessLevel ?? conf.access_level ?? 0
      }));
    } catch (error) {
console.error('[BBSApi] Error listing conferences:', error);
      return [];
    }
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
  async getSystemInfo(): Promise<BBSSystemInfo> {
    const sysConfig = await db.getConfigRepository().getSystemConfig();
    return {
      bbsName: sysConfig?.bbs_name || 'AmiExpress-Web',
      sysopName: sysConfig?.sysop_name || 'Sysop',
      version: '2.x',
      nodes: sysConfig?.max_nodes || 255
    };
  }

  /**
   * Get information about all nodes (for WHO doors)
   */
  async getNodes(): Promise<BBSNode[]> {
    try {
      // Import NodeStatusManager (avoid circular dependency by lazy loading)
      const { nodeStatusManager } = await import('../nodes/NodeStatusManager');
      const activeNodes = nodeStatusManager.getActiveNodes();

      return activeNodes.map(node => ({
        nodeId: node.nodeId,
        username: node.handle || 'Unknown',
        location: node.location || '',
        activity: node.misc1 || 'Online',
        online: true
      }));
    } catch (error) {
console.error('[BBSApi] Error getting nodes:', error);
      // Fallback: return current node only
      return [
        {
          nodeId: this.getNodeNumber(),
          username: this.session.user?.username || 'Unknown',
          location: 'In door',
          activity: 'Running door',
          online: true
        }
      ];
    }
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
   * Read and parse Amiga .info file (tooltypes)
   * Returns array of key/value pairs extracted from the binary .info file
   *
   * @param filename Path to .info file relative to BBS root or absolute
   * @returns Array of tooltype entries, or null if error
   */
  async readInfoFile(filename: string): Promise<Array<{ key: string; value: string; commented: boolean }> | null> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      // Use the proper .info file parser that handles binary format
      const { parseInfoFile } = require('../utils/info-file.util');
      const infoFile = parseInfoFile(fullPath);

      // Return tooltypes in a simplified format
      return infoFile.tooltypes.map((tt: any) => ({
        key: tt.key,
        value: tt.value,
        commented: tt.commented
      }));
    } catch (error) {
console.error(`[BBSApi] Error reading .info file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Write/update Amiga .info file tooltypes
   * Preserves binary header and icon data, only updates tooltypes
   *
   * @param filename Path to .info file relative to BBS root or absolute
   * @param tooltypes Array of tooltype entries to write
   * @returns true if successful, false on error
   */
  async writeInfoFile(filename: string, tooltypes: Array<{ key: string; value: string; commented?: boolean }>): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      // Use the proper .info file parser and writer
      const { parseInfoFile, writeInfoFile } = require('../utils/info-file.util');

      // Parse existing file to preserve header and icon data
      const infoFile = parseInfoFile(fullPath);

      // Update tooltypes
      infoFile.tooltypes = tooltypes.map((tt: any) => ({
        key: tt.key.toUpperCase(),
        value: tt.value,
        commented: tt.commented || false,
        originalLine: `${tt.commented ? '!' : ''}${tt.key.toUpperCase()}=${tt.value}`
      }));

      // Write back to file
      writeInfoFile(infoFile);
      return true;
    } catch (error) {
console.error(`[BBSApi] Error writing .info file ${filename}:`, error);
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
    try {
      const messageData = {
        subject,
        body,
        author: this.session.user?.username || 'Unknown',
        timestamp: getSystemTime(),
        conferenceId: this.getCurrentConference(),
        messageBaseId: 1, // Default to first message base
        isPrivate: true,
        toUser: toUsername,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      };

      await db.createMessage(messageData);
console.log(`[BBSApi] Sent private message to ${toUsername}: ${subject}`);
      return true;
    } catch (error) {
console.error('[BBSApi] Error sending message:', error);
      return false;
    }
  }

  /**
   * Post message to current conference
   * Equivalent to AEDoor JH_SM command
   */
  async postMessage(subject: string, body: string): Promise<boolean> {
    try {
      const messageData = {
        subject,
        body,
        author: this.session.user?.username || 'Unknown',
        timestamp: getSystemTime(),
        conferenceId: this.getCurrentConference(),
        messageBaseId: 1, // Default to first message base
        isPrivate: false,
        toUser: undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      };

      await db.createMessage(messageData);
console.log(`[BBSApi] Posted message to conference ${this.getCurrentConference()}: ${subject}`);
      return true;
    } catch (error) {
console.error('[BBSApi] Error posting message:', error);
      return false;
    }
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

  /**
   * Execute a BBS command (same path as user-typed commands)
   * If a door is active, queue the command to run after the door exits.
   */
  async executeCommand(command: string, params?: string | string[]): Promise<void> {
    const trimmed = (command || '').trim();
    if (!trimmed) return;

    const paramText = Array.isArray(params) ? params.join(' ') : (params || '').trim();
    const commandLine = paramText ? `${trimmed} ${paramText}` : trimmed;

    if (this.session.inDoorManager) {
      if (!this.session.pendingDoorCommands) {
        this.session.pendingDoorCommands = [];
      }
      this.session.pendingDoorCommands.push(commandLine);
console.log(`[BBSApi.executeCommand] Queued command for after door exit: ${commandLine}`);
      return;
    }

    const { handleCommand } = require('../handlers/command.handler');
    // Bypass READ_COMMAND's line buffering and execute like an entered command.
    this.session.commandText = commandLine.toUpperCase();
    this.session.subState = LoggedOnSubState.PROCESS_COMMAND;
    await handleCommand(this.socket, this.session, '');
  }

  /**
   * Get list of available doors
   * Used by door menu systems to display available doors
   */
  async getDoorList(): Promise<Array<{
    id: string;
    command: string;
    name: string;
    description: string;
    type: string;
    doorType?: string;
    size: number;
    accessLevel: number;
    enabled: boolean;
    category?: string;
  }>> {
    const { getDoors } = require('../handlers/door.handler');
    const allDoors = getDoors();
    const bbsRoot = (this.session as any)?.dataDir || process.env.BBS_DATA_DIR || process.cwd();

    return allDoors.map((door: any) => {
      let doorSize = door.size || 0;
      if (doorSize === 0) {
        const doorPath = door.path || door.location || '';
        if (doorPath) {
          try {
            const amigafs = require('../utils/amigafs');
            const pathMod = require('path');
            // Try the direct path first, then common variations
            const candidates = [
              pathMod.join(bbsRoot, doorPath),
              pathMod.join(bbsRoot, 'Doors', door.id || door.command),
              pathMod.join(bbsRoot, 'Doors', (door.command || door.id || '').toLowerCase()),
            ];
            for (const testPath of candidates) {
              if (amigafs.existsSync(testPath)) {
                const stats = amigafs.statSync(testPath);
                doorSize = stats.isDirectory() ? stats.size : stats.size;
                break;
              }
            }
          } catch (_) { /* ignore */ }
        }
      }
      return {
        id: door.id || door.command,
        command: door.command || door.id,
        name: door.name || door.command || door.id,
        description: door.description || '',
        type: door.type || 'AMI',
        doorType: door.type,
        size: doorSize,
        accessLevel: door.accessLevel || 0,
        enabled: door.enabled !== false,
        category: door.category || undefined,
        location: door.path || ''
      };
    });
  }

  /**
   * Delete a door completely (directory + .info files)
   * Used by door manager for uninstalling doors
   * @param identifier - Door name (directory name for TS doors) or command name (for Amiga doors)
   * @param isTypeScriptDoor - Set to true if this is a TypeScript/SDK door
   * @returns Result object with success status and message
   */
  async deleteDoor(identifier: string, isTypeScriptDoor?: boolean): Promise<{ success: boolean; message: string }> {
console.log(`[BBSApi.deleteDoor] Called with identifier="${identifier}", isTypeScriptDoor=${isTypeScriptDoor}`);

    // Check if user has sysop access
    if (this.session.user && this.session.user.secLevel < 250) {
console.log(`[BBSApi.deleteDoor] Access denied: user secLevel=${this.session.user?.secLevel}`);
      return {
        success: false,
        message: 'Access denied: SysOp access required to delete doors'
      };
    }

    try {
      const { getAmigaDoorManager, refreshDoorCache } = await import('./amigaDoorManager');
      const manager = getAmigaDoorManager();
console.log(`[BBSApi.deleteDoor] Calling manager.deleteDoor("${identifier}", ${isTypeScriptDoor})`);
      const result = await manager.deleteDoor(identifier, isTypeScriptDoor);
console.log(`[BBSApi.deleteDoor] Result: ${JSON.stringify(result)}`);

      if (result.success) {
        // Refresh amiga door cache
        await refreshDoorCache();
        // Also reload the TypeScript door registry so the deleted door
        // is removed from getDoors() immediately (without server restart)
        try {
          const { initializeDoors } = require('../handlers/door.handler');
          await initializeDoors();
        } catch (e) {
          console.warn('[BBSApi.deleteDoor] Could not reload door registry:', e);
        }
      }

      return result;
    } catch (error) {
console.error('[BBSApi.deleteDoor] Error:', error);
      return {
        success: false,
        message: `Delete failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Enable or disable a door by its command name.
   * Requires SysOp access (secLevel >= 250).
   */
  async setDoorEnabled(command: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
    if (this.session.user && this.session.user.secLevel < 250) {
      return { success: false, message: 'Access denied: SysOp access required' };
    }
    try {
      const { getAmigaDoorManager } = await import('./amigaDoorManager');
      const manager = getAmigaDoorManager();
      const result = await manager.setDoorEnabled(command, enabled);
      return result;
    } catch (error) {
      return { success: false, message: `Failed: ${(error as Error).message}` };
    }
  }

  /**
   * Emit a custom door event that will be broadcast to LiveChat and webhooks
   *
   * @param eventType - Type of event (e.g., 'project_created', 'task_completed', 'achievement_unlocked')
   * @param message - Human-readable message for display in LiveChat
   * @param data - Optional additional data to include with the event
   *
   * @example
   * ```typescript
   * ctx.bbs.emitCustomEvent('project_created', 'Created new demo project "Revision 2025"', {
   *   projectName: 'Revision 2025',
   *   projectType: 'demo'
   * });
   * ```
   */
  emitCustomEvent(eventType: string, message: string, data?: Record<string, any>): void {
    try {
      const { emitCustomDoorEvent } = require('../services/bbs-event-emitter');

      emitCustomDoorEvent({
        username: this.session.user?.username || 'Unknown',
        nodeId: this.session.nodeId || 0,
        doorName: this.session.commandText || 'Door',
        eventType,
        message,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[BBSApi.emitCustomEvent] Failed to emit event:', error);
      // Don't throw - event emission failures should not crash the door
    }
  }

  /**
   * Request the user to upload a door archive via the browser file picker.
   * Resolves with the local path once upload completes; rejects after 5 min or on cancel.
   */
  requestArchiveUpload(): Promise<{ path: string; filename: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(new Error('Upload timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      this.session.pendingDoorUpload = true;
      this.session.pendingDoorUploadCallback = (result) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        resolve(result);
      };
      this.session.pendingDoorUploadReject = (err) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(err);
      };

      this.socket.emit('show-file-upload', {
        accept: '.zip,.lha,.lzh,.lzx',
        maxSize: 100 * 1024 * 1024,
        multiple: false,
      });
    });
  }

  /**
   * Install a door archive at the given path.
   * Extracts, auto-detects type, places in Doors/, creates registration .info.
   */
  async installDoor(archivePath: string): Promise<{
    success: boolean;
    message: string;
    doorName?: string;
    command?: string;
    type?: string;
  }> {
    const { config } = require('../config');
    const { DoorInstaller } = require('./door-installer');
    const installer = new DoorInstaller(config.get('dataDir'));
    return installer.install(archivePath);
  }
}

/**
 * Create BBS API instance for a door session
 */
export function createBBSApi(socket: Socket, session: BBSSession): BBSApi {
  const api = new BBSApi(socket, session);
  console.log('[createBBSApi] Created BBSApi, has enableMouseEvents:', typeof api.enableMouseEvents);
  return api;
}
