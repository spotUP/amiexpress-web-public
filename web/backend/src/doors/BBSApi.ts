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
import { Socket } from 'socket.io';
import type { BBSSession } from '../index';

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

  constructor(socket: Socket, session: BBSSession) {
    this.socket = socket;
    this.session = session;
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

      const content = fs.readFileSync(fullPath, 'utf8');
      return content;
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

      fs.writeFileSync(fullPath, content, 'utf8');
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

      return fs.existsSync(fullPath);
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

      const files = fs.readdirSync(fullPath);

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
}

/**
 * Create BBS API instance for a door session
 */
export function createBBSApi(socket: Socket, session: BBSSession): BBSApi {
  return new BBSApi(socket, session);
}
