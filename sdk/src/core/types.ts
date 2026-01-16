/**
 * Core SDK Type Definitions
 *
 * Professional type system for BBS door development
 */

import type { Socket } from 'socket.io';

// ===== User Types =====

export interface User {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  accessLevel: number;
  timesCalled: number;
  uploads: number;
  downloads: number;
  lastLogin?: Date;
  /** User's configured lines per screen (default 23, max 25) */
  linesPerScreen?: number;
}

// ===== ANSI Color Types =====

export enum AnsiColor {
  Black = 0,
  Red = 1,
  Green = 2,
  Yellow = 3,
  Blue = 4,
  Magenta = 5,
  Cyan = 6,
  White = 7,
}

export enum AnsiStyle {
  Normal = 0,
  Bold = 1,
  Dim = 2,
  Italic = 3,
  Underline = 4,
  Blink = 5,
  Reverse = 7,
}

// ===== Key Types =====

export interface KeyPress {
  key: string;           // The actual key: 'a', 'q', '\r', etc.
  raw: string;           // Raw input data
  ctrl: boolean;         // Ctrl key held
  alt: boolean;          // Alt key held
  shift: boolean;        // Shift key held
  meta: boolean;         // Meta/Cmd key held
}

export enum SpecialKey {
  Enter = '\r',
  Escape = '\x1b',
  Backspace = '\x7f',
  Tab = '\t',
  Space = ' ',
  ArrowUp = '\x1b[A',
  ArrowDown = '\x1b[B',
  ArrowRight = '\x1b[C',
  ArrowLeft = '\x1b[D',
  Delete = '\x1b[3~',
  Home = '\x1b[H',
  End = '\x1b[F',
  PageUp = '\x1b[5~',
  PageDown = '\x1b[6~',
}

// ===== Storage Types =====

export interface StorageOptions {
  doorName: string;      // Door identifier for storage path
  userId?: string;       // User-specific storage (optional)
  global?: boolean;      // Global storage (all users)
}

export interface SaveData {
  [key: string]: any;
}

// ===== Door Configuration =====

export interface DoorConfig {
  name: string;
  version: string;
  author: string;
  description?: string;
  accessLevel?: number;
  multiNode?: boolean;
  maxPlayers?: number;
}

// ===== Door Context =====

/**
 * DoorContext - Passed to all door lifecycle hooks
 *
 * Provides type-safe access to all door functionality
 */
export interface DoorContext {
  /** User information */
  user: User;

  /** Node ID (1-based) */
  nodeId: number;

  /** Output API */
  output: OutputAPI;

  /** Input API */
  input: InputAPI;

  /** Storage API */
  storage: StorageAPI;

  /** BBS API (optional advanced features) */
  bbs?: BBSApi;

  /** Command parameters */
  params: string[];

  /** Socket.IO socket (for advanced use cases like blessed) */
  socket?: any;

  /** BBS session (for advanced use cases like blessed) */
  bbsSession?: any;

  /** Close the door and return to BBS */
  close(): Promise<void>;
}

// ===== Output API =====

export interface OutputAPI {
  /** Write text with ANSI codes */
  write(text: string): Promise<void>;

  /** Write text with newline */
  writeLine(text: string): Promise<void>;

  /** Clear screen */
  clear(): Promise<void>;

  /** Move cursor to position (1-based) */
  moveCursor(row: number, col: number): Promise<void>;

  /** Set foreground color */
  setForeground(color: AnsiColor): Promise<void>;

  /** Set background color */
  setBackground(color: AnsiColor): Promise<void>;

  /** Set text style */
  setStyle(style: AnsiStyle): Promise<void>;

  /** Reset all colors and styles */
  reset(): Promise<void>;

  /** Save cursor position */
  saveCursor(): Promise<void>;

  /** Restore cursor position */
  restoreCursor(): Promise<void>;

  /** Hide cursor */
  hideCursor(): Promise<void>;

  /** Show cursor */
  showCursor(): Promise<void>;

  /** Erase to end of line */
  eraseToEndOfLine(): Promise<void>;

  /** Erase to end of screen */
  eraseToEndOfScreen(): Promise<void>;

  /** Scroll screen */
  scroll(lines: number): Promise<void>;
}

// ===== Input API =====

export interface InputAPI {
  /** Wait for any key press */
  waitForKey(): Promise<KeyPress>;

  /** Wait for specific key */
  waitForKeyPress(key: string): Promise<void>;

  /** Get line of text (with optional prompt) */
  getLine(prompt?: string, maxLength?: number): Promise<string>;

  /** Get single character */
  getChar(): Promise<string>;

  /** Get yes/no answer */
  getYesNo(prompt?: string): Promise<boolean>;

  /** Get number input */
  getNumber(prompt?: string, min?: number, max?: number): Promise<number>;

  /** Get choice from menu */
  getChoice(prompt: string, choices: string[]): Promise<number>;

  /** Set timeout for input (milliseconds) */
  setTimeout(ms: number): void;

  /** Clear timeout */
  clearTimeout(): void;
}

// ===== Storage API =====

export interface StorageAPI {
  /** Save data */
  save(key: string, data: any): Promise<void>;

  /** Load data */
  load<T = any>(key: string): Promise<T | null>;

  /** Delete data */
  delete(key: string): Promise<void>;

  /** Check if key exists */
  exists(key: string): Promise<boolean>;

  /** List all keys */
  keys(): Promise<string[]>;

  /** Clear all data */
  clear(): Promise<void>;
}

// ===== BBS API (Advanced) =====

export interface BBSApi {
  /** Get user by ID */
  getUser(userId: string): Promise<User | null>;

  /** Get all online users */
  getOnlineUsers(): Promise<User[]>;

  /** Send message to user */
  sendMessage(userId: string, message: string): Promise<void>;

  /** Broadcast message to all users */
  broadcast(message: string): Promise<void>;

  /** Check user access level */
  hasAccess(userId: string, level: number): Promise<boolean>;

  /** Read file from BBS data directory */
  readFile(filename: string): Promise<string | null>;

  /** Write file to BBS data directory */
  writeFile(filename: string, content: string): Promise<boolean>;

  /** List files in a directory with optional pattern filter */
  listFiles(directory: string, pattern?: string): Promise<string[]>;

  /** Check if file exists */
  fileExists(filename: string): Promise<boolean>;
}

// ===== Lifecycle Hooks =====

export type StartHandler = (ctx: DoorContext) => Promise<void> | void;
export type InputHandler = (ctx: DoorContext, key: KeyPress) => Promise<void> | void;
export type CloseHandler = (ctx: DoorContext) => Promise<void> | void;
export type ErrorHandler = (ctx: DoorContext, error: Error) => Promise<void> | void;

// ===== Internal Types (used by SDK implementation) =====

/**
 * Internal representation of door session from BBS backend
 * This is what the BBS passes to the door
 */
export interface RawDoorSession {
  socket: Socket;
  bbsSession: any;     // BBSSession from backend
  user: User;
  bbs?: any;
  params?: string[];
}
