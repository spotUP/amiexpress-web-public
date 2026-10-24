import type { DoorAnnouncer } from '../../core/announce';
/**
 * Core SDK Type Definitions
 *
 * Professional type system for BBS door development
 */

import type { Socket } from 'socket.io';

// ===== User Types =====

/**
 * A node with a logged-in caller on it, as `getOnlineUsers()` returns it.
 *
 * The board answers from its own session map, in the door's process, so the
 * call is synchronous. This was declared `Promise<User[]>` while the board
 * returned these rows directly; a door awaiting the declared shape got rows
 * with none of the fields it was told to expect.
 */
export interface OnlineNode {
  nodeNumber: number;
  username: string;
  location: string;
  ipAddress: string;
  status: 'active' | 'detached';
}

// The caller, as the board hands it to a door. One definition, in
// core/types: this legacy tree kept its own copy, which still said
// `accessLevel` after the board's field became `secLevel` (db76a6eca), so a
// ServerDoor handler typed with the core DoorContext no longer type-checked.
import type { User } from '../../core/types';
export type { User };

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

  /** Audio streaming API (voice chat) */
  audio?: any;

  /** Video streaming API (webcam/screen share) */
  video?: any;

  /** Close the door and return to BBS */
  close(): Promise<void>;

  /**
   * Announcements: tell the board something worth telling other people -
   * a table open to join, a match started, a winner, a score. Reaches
   * LiveChat and the sysop's Discord/Slack webhooks. Always present; a
   * no-op on a host that cannot carry it (core/announce.ts).
   */
  announce: DoorAnnouncer;
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
  /** True when the caller reads PETSCII (a C64 alphabet), not ASCII. Optional: an older backend has no such method. */
  isPetsciiMode?(): boolean;
  /** False when the caller has ANSI colour off: the board strips every colour code, so each state needs a character marker. Optional: an older backend has no such method (treat as true). */
  isAnsiMode?(): boolean;
  /** W's web terminal rows (modem speed, font, PETSCII palette and character set) as the caller has them now. Optional: an older backend has no such method. */
  webTerminalSettings?(): import('../../core/types').WebTerminalState;
  /** The modem emulation speed labels, in the order chooseModemSpeed numbers them. Optional: an older backend has no such method. */
  modemSpeedChoices?(): string[];
  /** Store, apply and announce a modem emulation speed by its index in modemSpeedChoices(); false when out of range. Optional: an older backend has no such method. */
  chooseModemSpeed?(choice: number): Promise<boolean>;
  /** The terminal fonts a caller can pick on an 80-column ANSI screen. Optional: an older backend has no such method. */
  terminalFontChoices?(): Array<{ id: string; label: string }>;
  /** Choose a terminal font; 'petscii' means the screen is PETSCII and its font is fixed. Optional: an older backend has no such method. */
  chooseTerminalFont?(fontId: string): Promise<'set' | 'petscii'>;
  /** Flip the 80-column PETSCII palette between C128 (VDC) and C64 (VIC-II). Optional: an older backend has no such method. */
  togglePetsciiPalette?(): Promise<'vdc' | 'vic'>;
  /** Flip the PETSCII character set between standard and Swedish; the notice is the board's own sentence. Optional: an older backend has no such method. */
  togglePetsciiCharset?(): Promise<{ charset: 'standard' | 'swedish'; notice: string }>;
  /** False when the caller turned animations off (W row 23) and the running door is not a game. Optional: an older backend has no such method. */
  animationsAllowed?(): boolean;
  /** Turn board animations (slides, wipes, door effects) on or off; resolves true when they are now on. Optional: an older backend has no such method. */
  toggleAnimations?(): Promise<boolean>;
  /** The caller's own record as W option 19 prints it. Optional: an older backend has no such method. */
  myData?(): Array<{ label: string; value: string }>;
  /** Run the board's three GDPR erasure checks (confirm, password, username) in order and, unless check is true, erase and drop the line. Optional: an older backend has no such method. */
  eraseMyAccount?(answers: { confirm: string; password: string; username: string }, opts?: { check?: boolean }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Raise one of this door's own notification events for a user (id or name).
   * The type must be `door.<command>.<slug>` for the running door.
   * `objectId` is required (it dedupes repeats); a call without one is refused. It queues
   * an outbox row; the user's NOTIFY choices decide delivery. Returns true
   * when a row was queued. Optional: an older backend has no such method.
   */
  notify?(type: string, toUser: string, item: { title: string; body: string; url?: string; objectId: string }): boolean;
  /**
   * The caller's notification choices (the NOTIFY door's API): catalogue, get/set,
   * follow, email verification, test. The caller is the session's own user.
   * Optional: an older backend has no such method.
   */
  notifications?(): import('../../formats/notify').DoorNotificationsApi;
  /** Get user by ID */
  getUser(userId: string): Promise<User | null>;

  /** Who is on the board: one row per node with a logged-in caller. */
  getOnlineUsers(): OnlineNode[];

  /*
   * NOTE, 2026-09-22: this is the SECOND declaration of `BBSApi` in the SDK
   * - `core/types.ts` has the other, and `server/index.ts` reaches this one
   * through `src/core/Door`. They drift, and a door written against the
   * wrong copy fails to compile with two types of the same name. Converging
   * them is its own job; until then, a change to one belongs in both.
   */

  /**
   * Send a PRIVATE message to a user, in the caller's conference. Three
   * arguments, as the board has always implemented it.
   */
  sendMessage(toUsername: string, subject: string, body: string): Promise<boolean>;

  /**
   * Where the caller's conference keeps its files, as a host path - through
   * the board's own resolver, so it is `LOCATION.n` and never `Conf<n>`
   * built from the number. Optional: an older backend has no such method.
   */
  getConferencePath?(conferenceNumber?: number): string;

  /**
   * The ENABLED tooltypes of a `.info` file under the board's directory. A
   * flag tooltype with no `=` comes back with an empty value; a disabled
   * one - `(KEY=value)` or `!KEY=value` - is not there at all.
   */
  readTooltypes?(relativePath: string): Record<string, string>;

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

  /**
   * Switch the session into raw keydown/keyup ("game") mode.
   * Frontend stops sending normal command input until disableGameMode() runs.
   * Optional doorType is recorded on the session for diagnostics; defaults to 'TS'.
   */
  enableGameMode?(doorType?: string): void;

  /** Restore normal input handling and clear any held-key state. */
  disableGameMode?(): void;
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
