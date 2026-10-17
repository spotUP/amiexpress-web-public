import type { DoorAnnouncer } from './announce';
/**
 * Core Type Definitions for AmiExpress BBS Door SDK
 *
 * These types provide the foundation for all door development,
 * ensuring type safety and enabling AI-friendly code generation.
 */

/**
 * BBS User Session
 * Represents a connected user with their profile and state
 */
export interface BBSUser {
  /** Unique user ID */
  id: number;
  /** Username */
  name: string;
  /** Security level (0-255, where 255 = sysop) */
  securityLevel: number;
  /** User's current node number */
  node: number;
  /** Time remaining in session (minutes) */
  timeLeft: number;
  /** User's graphics mode (ANSI, ASCII, RIP) */
  graphicsMode: 'ANSI' | 'ASCII' | 'RIP';
  /** Terminal width (typically 80) */
  termWidth: number;
  /** Terminal height (typically 24) */
  termHeight: number;
  /** User's custom data storage */
  data: Record<string, any>;
}

/**
 * Door Configuration
 * Settings for initializing a BBS door
 */
/**
 * One thing a sysop can set on a door, from the admin.
 *
 * A door declares these in `door.settings.json` beside its package.json - as
 * DATA, not as exported code, because the backend has to learn what a door can
 * be asked without executing it. Importing 34 door modules to build an admin
 * page runs each door's top-level code, and a door that is broken or halfway
 * through development would take the page down with it. JSON is also readable
 * before a door has ever been built.
 */
export interface DoorSetting {
  /** Stable key. What lands in settings.json and what the door reads. */
  key: string;
  /** What the sysop sees. */
  label: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  /** Required when type is 'choice', ignored otherwise. */
  choices?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
  /** One line under the control. */
  help?: string;
  /** Numbers only. */
  min?: number;
  max?: number;
  /** Stored, but never returned by the API - a password field in the admin. */
  secret?: boolean;
}

/** A door's whole declaration: `Doors/<door>/door.settings.json`. */
export interface DoorSettingsManifest {
  /** The door's command, matching `bbsCommand` in its package.json. */
  command: string;
  settings: DoorSetting[];
}

/** What a door gets back: its declared keys, with the sysop's values applied. */
export type DoorSettingValues = Record<string, string | number | boolean>;

export interface DoorConfig {
  /** Door name (displayed to users) */
  name: string;
  /** Version string (e.g., "1.0.0") */
  version: string;
  /** Author name */
  author: string;
  /** Short description */
  description?: string;
  /** Minimum security level required (0-255) */
  minSecurity?: number;
  /** Maximum time limit (minutes, 0 = unlimited) */
  maxTime?: number;
  /** Enable multiplayer support */
  multiplayer?: boolean;
  /** Custom configuration data */
  config?: Record<string, any>;
}

/**
 * Position in 2D space (terminal coordinates)
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Size dimensions
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Rectangle (position + size)
 */
export interface Rect extends Position, Size {}

/**
 * ANSI Color codes (0-15 standard palette)
 */
export enum AnsiColor {
  Black = 0,
  Red = 1,
  Green = 2,
  Yellow = 3,
  Blue = 4,
  Magenta = 5,
  Cyan = 6,
  White = 7,
  BrightBlack = 8,
  Gray = 8,  // Alias for BrightBlack
  BrightRed = 9,
  BrightGreen = 10,
  BrightYellow = 11,
  BrightBlue = 12,
  BrightMagenta = 13,
  BrightCyan = 14,
  BrightWhite = 15
}

/**
 * Keyboard input event
 */
export interface KeyEvent {
  /** Key code or character */
  key: string;
  /** Is Ctrl pressed? */
  ctrl: boolean;
  /** Is Alt pressed? */
  alt: boolean;
  /** Is Shift pressed? */
  shift: boolean;
  /** Raw key code */
  code: number;
}

/**
 * Mouse input event (simulated via keyboard)
 */
export interface MouseEvent {
  /** Mouse position */
  position: Position;
  /** Button pressed (1=left, 2=middle, 3=right) */
  button: number;
  /** Event type */
  type: 'click' | 'move' | 'down' | 'up';
}

/**
 * Sprite animation frame
 */
export interface AnimationFrame {
  /** Frame image data (ANSI or ASCII) */
  data: string;
  /** Frame duration in milliseconds */
  duration: number;
}

/**
 * Sprite definition
 */
export interface Sprite {
  /** Sprite ID */
  id: string;
  /** Current position */
  position: Position;
  /** Sprite size */
  size: Size;
  /** Animation frames */
  frames: AnimationFrame[];
  /** Current frame index */
  currentFrame: number;
  /** Is animation playing? */
  playing: boolean;
  /** Loop animation? */
  loop: boolean;
  /** Sprite visibility */
  visible: boolean;
  /** Z-index (layer order) */
  zIndex: number;
}

/**
 * Parallax layer for scrolling backgrounds
 */
export interface ParallaxLayer {
  /** Layer image data */
  image: string;
  /** Scroll speed multiplier (0.0 - 1.0) */
  scrollSpeed: number;
  /** Depth (higher = further back) */
  depth: number;
  /** Current scroll offset */
  offset: Position;
  /** Layer opacity (0.0 - 1.0) */
  opacity: number;
}

/**
 * Particle system configuration
 */
export interface ParticleSystemConfig {
  /** Particle type identifier */
  type: string;
  /** Number of particles */
  count: number;
  /** Particle lifetime (milliseconds) */
  lifetime: number;
  /** Velocity range */
  velocity: { min: number; max: number };
  /** Spawn position */
  position?: Position;
  /** Particle color */
  color?: AnsiColor;
  /** Gravity effect */
  gravity?: number;
}

/**
 * Physics body (for collision and movement)
 */
export interface PhysicsBody {
  /** Unique ID */
  id: string;
  /** Position */
  position: Position;
  /** Size */
  size: Size;
  /** Velocity */
  velocity: Position;
  /** Acceleration */
  acceleration: Position;
  /** Mass */
  mass: number;
  /** Friction coefficient */
  friction: number;
  /** Bounce/restitution coefficient */
  bounce: number;
  /** Is body static (immovable)? */
  static: boolean;
  /** Collision category (for filtering) */
  category: string;
  /** Custom body data */
  data: Record<string, any>;
}

/**
 * Collision event
 */
export interface Collision {
  /** First body */
  bodyA: PhysicsBody;
  /** Second body */
  bodyB: PhysicsBody;
  /** Collision normal vector */
  normal: Position;
  /** Collision depth/penetration */
  depth: number;
}

/**
 * Menu item definition
 */
export interface MenuItem {
  /** Display text */
  text: string;
  /** Hotkey (single character) */
  key?: string;
  /** Action callback */
  action: () => void | Promise<void>;
  /** Is item enabled? */
  enabled: boolean;
  /** Is item visible? */
  visible: boolean;
  /** Submenu items */
  submenu?: MenuItem[];
}

/**
 * Menu configuration
 */
export interface MenuConfig {
  /** Menu title */
  title: string;
  /** Visual style */
  style: 'classic' | 'retro-neon' | 'minimalist' | 'boxed';
  /** Navigation mode */
  navigation: 'arrow-keys' | 'number-keys' | 'hotkeys';
  /** Is menu modal? (blocks underlying content) */
  modal: boolean;
  /** Menu position (null = centered) */
  position?: Position;
}

/**
 * HUD element configuration
 */
export interface HUDElement {
  /** Element type */
  type: 'text' | 'bar' | 'counter' | 'timer' | 'minimap' | 'image';
  /** Position on screen */
  position: Position;
  /** Element size */
  size?: Size;
  /** Display format/style */
  format?: string;
  /** Element color */
  color?: AnsiColor;
  /** Is element visible? */
  visible: boolean;
  /** Animate on value change? */
  animate: boolean;
  /** Update callback */
  update?: (delta: number) => void;
}

/**
 * Audio configuration
 */
export interface AudioConfig {
  /** Master volume (0.0 - 1.0) */
  masterVolume: number;
  /** Music volume (0.0 - 1.0) */
  musicVolume: number;
  /** SFX volume (0.0 - 1.0) */
  sfxVolume: number;
  /** Enable audio? */
  enabled: boolean;
  /**
   * Reverb on the EFFECTS bus only.
   *
   * Music is left dry deliberately: a tracker module through a long reverb
   * turns to mush. Omit for no reverb at all.
   */
  sfxReverb?: {
    /** How much of the signal is reverberated, 0..1. */
    wet: number;
    /** Tail length in seconds. Big rooms and space are 3+. */
    decay?: number;
    /** Gap before the tail starts, in seconds. */
    preDelay?: number;
  };
  /**
   * A repeating echo on the EFFECTS bus, in front of any reverb.
   *
   * This is the "bounce" - discrete repeats - where reverb is the wash
   * around them. Music stays dry for the same reason as above.
   */
  sfxEcho?: {
    /** Seconds between repeats. */
    delayTime: number;
    /** How much of each repeat feeds the next, 0..1. Above ~0.7 rings on. */
    feedback: number;
    /** How much echo is mixed in, 0..1. */
    wet: number;
  };
}

/**
 * Sound effect parameters
 */
export interface SoundEffect {
  /** Sound type/name */
  type: string;
  /** Frequency (Hz) */
  frequency: number;
  /** Duration (seconds) */
  duration: number;
  /** Envelope shape */
  envelope: 'pluck' | 'fade' | 'sustain';
  /** Volume (0.0 - 1.0) */
  volume: number;
}

/**
 * Music generation parameters (AI-driven)
 */
export interface MusicPrompt {
  /** Text prompt (e.g., "upbeat chiptune in C major") */
  prompt: string;
  /** Tempo (BPM) */
  tempo: number;
  /** Pattern (e.g., "x-x-x-x-") */
  pattern: string;
  /** Instruments */
  instruments: string[];
  /** Duration (measures) */
  duration?: number;
}

/**
 * Save game data structure
 */
export interface SaveData {
  /** Save slot ID */
  slot: number;
  /** Timestamp */
  timestamp: Date;
  /** Game state data */
  state: Record<string, any>;
  /** Player progress */
  progress: number;
  /** Custom metadata */
  metadata: Record<string, any>;
}

/**
 * High score entry
 */
export interface HighScoreEntry {
  /** Rank (1-based) */
  rank: number;
  /** Player name */
  player: string;
  /** Score */
  score: number;
  /** Date achieved */
  date: Date;
  /** Additional data */
  data?: Record<string, any>;
}

/**
 * Event handler callback
 */
export type EventHandler<T = any> = (data: T) => void | Promise<void>;

/**
 * Timer configuration
 */
export interface TimerConfig {
  /** Timer duration (milliseconds) */
  duration: number;
  /** Repeat timer? */
  repeat: boolean;
  /** Callback on timer complete */
  onComplete: () => void;
}

/**
 * Level/map tile
 */
export interface Tile {
  /** Tile ID/type */
  type: string;
  /** Position in tile grid */
  gridPosition: Position;
  /** Visual representation */
  char: string;
  /** Tile color */
  color: AnsiColor;
  /** Is tile solid/collidable? */
  solid: boolean;
  /** Custom tile properties */
  properties: Record<string, any>;
}

/**
 * Level/map definition
 */
export interface Level {
  /** Level ID */
  id: string;
  /** Level name */
  name: string;
  /** Grid dimensions */
  gridSize: Size;
  /** Tile map (2D array) */
  tiles: Tile[][];
  /** Spawn points */
  spawns: Position[];
  /** Custom level data */
  data: Record<string, any>;
}

/**
 * AI pathfinding node
 */
export interface PathNode {
  /** Position */
  position: Position;
  /** G cost (distance from start) */
  g: number;
  /** H cost (heuristic to goal) */
  h: number;
  /** F cost (g + h) */
  f: number;
  /** Parent node */
  parent?: PathNode;
}

/**
 * AI behavior state
 */
export interface AIState {
  /** Current state name */
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'custom';
  /** Target position or entity */
  target?: Position | PhysicsBody;
  /** Current path */
  path?: Position[];
  /** State-specific data */
  data: Record<string, any>;
}

/**
 * Inventory item
 */
export interface InventoryItem {
  /** Item ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Item properties */
  properties: Record<string, any>;
  /** Use callback */
  onUse?: () => void;
}

/**
 * Character stats (RPG)
 */
export interface CharacterStats {
  /** Health points */
  hp: number;
  /** Maximum health */
  maxHp: number;
  /** Mana/magic points */
  mp: number;
  /** Maximum mana */
  maxMp: number;
  /** Attack power */
  attack: number;
  /** Defense */
  defense: number;
  /** Speed/agility */
  speed: number;
  /** Level */
  level: number;
  /** Experience points */
  exp: number;
  /** Custom stats */
  custom: Record<string, number>;
}

/**
 * Network message (multiplayer)
 */
export interface NetworkMessage {
  /** Message type */
  type: string;
  /** Sender ID */
  from: number;
  /** Recipient ID (0 = broadcast) */
  to: number;
  /** Message payload */
  data: any;
  /** Timestamp */
  timestamp: number;
}

/**
 * Cutscene scene definition
 */
export interface CutsceneScene {
  /** Scene image (ANSI art ID) */
  image: string;
  /** Scene duration (milliseconds) */
  duration: number;
  /** Transition type */
  transition?: 'fade' | 'slide' | 'instant';
  /** Scene text overlay */
  text?: string;
  /** Text position */
  textPosition?: Position;
}

/**
 * Cutscene definition
 */
export interface Cutscene {
  /** Cutscene ID */
  id: string;
  /** Cutscene scenes */
  scenes: CutsceneScene[];
  /** Skip allowed? */
  skippable: boolean;
  /** Callback on complete */
  onComplete?: () => void;
}

/**
 * Door lifecycle event types
 */
export type DoorEvent =
  | 'init'
  | 'connect'
  | 'disconnect'
  | 'input'
  | 'update'
  | 'render'
  | 'shutdown';

// =============================================================================
// SDK v2.0 Type Additions
// Professional BBS Door SDK - Modern TypeScript API
// =============================================================================

import type { Socket } from 'socket.io';

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
  /** `detached`: a dropped web session parked inside its resume window. */
  status: 'active' | 'detached';
}

/**
 * User (SDK v2.0)
 * Modern user interface for SDK v2.0 Door class
 */
export interface User {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  secLevel: number;
  timesCalled: number;
  uploads: number;
  downloads: number;
  lastLogin?: Date;
}

/**
 * ANSI text styles
 */
export enum AnsiStyle {
  Normal = 0,
  Bold = 1,
  Dim = 2,
  Italic = 3,
  Underline = 4,
  Blink = 5,
  Reverse = 7,
}

/**
 * KeyPress - Modern key event type for SDK v2.0
 */
export interface KeyPress {
  key: string;           // The actual key: 'a', 'q', '\r', etc.
  raw: string;           // Raw input data
  ctrl: boolean;         // Ctrl key held
  alt: boolean;          // Alt key held
  shift: boolean;        // Shift key held
  meta: boolean;         // Meta/Cmd key held
}

/**
 * Special keys for easy reference
 */
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

/**
 * Storage options for door data persistence
 */
export interface StorageOptions {
  doorName: string;      // Door identifier for storage path
  userId?: string;       // User-specific storage (optional)
  global?: boolean;      // Global storage (all users)
}

/**
 * Generic save data structure
 */
export interface SaveData {
  [key: string]: any;
}

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

  /** Video API (optional - for ASCII video streaming) */
  video?: VideoAPI;

  /** Audio API (optional - for real-time voice chat) */
  audio?: AudioAPI;

  /** BBS API (optional advanced features) */
  bbs?: BBSApi;

  /**
   * Announcements: tell the board something worth telling other people -
   * a table open to join, a match started, a winner, a score. Reaches
   * LiveChat and the sysop's Discord/Slack webhooks. Always present; a no-op
   * on a host that cannot carry it (core/announce.ts).
   */
  announce: DoorAnnouncer;

  /** Command parameters */
  params: string[];

  /** Socket.IO socket (for advanced use cases like blessed) */
  socket?: any;

  /** BBS session (for advanced use cases like blessed) */
  bbsSession?: any;

  /** Alias for bbsSession — used by older arcade door code (ctx.session) */
  session?: any;

  /** Close the door and return to BBS */
  /**
   * Report one of THIS door's own achievement events (achievements SP3).
   * The type is `door.<command>.<slug>` for the running door; anything else
   * is refused by the board. Returns true when it was recorded, false when
   * the board has no achievements server, the caller is not a player, or
   * the type is not this door's. Never throws.
   *
   * Optional so a door built against an older SDK - and the legacy context
   * copy under sdk/src - still satisfies the type; Door.ts always supplies
   * it, so `ctx.achievement?.(...)` is the only guard a door ever needs.
   */
  achievement?: (type: string, opts?: { value?: number; key?: string }) => boolean;
  close: () => void;
}

/**
 * Output API - Type-safe output methods
 */
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

/**
 * Input API - Type-safe input methods
 */
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

/**
 * Storage API - Type-safe persistence methods
 */
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

/** The board's web-terminal settings (W rows 17, 18, 21, 22), declared once here. */
export interface WebTerminalState {
  /** The modem speed label, 'MAX (No Throttle)' when off. */
  modemSpeed: string;
  /** The font id, or 'C64 CHARACTER SET' on a PETSCII screen. */
  font: string;
  /** Why the font cannot change on a PETSCII screen, else ''. */
  fontFixedNotice: string;
  petsciiPalette: 'C128 (VDC)' | 'C64 (VIC-II)';
  petsciiCharset: 'STANDARD' | 'SWEDISH';
}

/**
 * BBS API (Advanced) - Optional BBS integration
 */
export interface BBSApi {
  /** True when the caller reads PETSCII (a C64 alphabet), not ASCII. Optional: an older backend has no such method. */
  isPetsciiMode?(): boolean;
  /** False when the caller has ANSI colour off: the board strips every colour code, so each state needs a character marker. Optional: an older backend has no such method (treat as true). */
  isAnsiMode?(): boolean;
  /** W's web terminal rows (modem speed, font, PETSCII palette and character set) as the caller has them now. Optional: an older backend has no such method. */
  webTerminalSettings?(): WebTerminalState;
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
  /** The caller's own record as W option 19 prints it. Optional: an older backend has no such method. */
  myData?(): Array<{ label: string; value: string }>;
  /** Run the board's three GDPR erasure checks (confirm, password, username) in order and, unless check is true, erase and drop the line. Optional: an older backend has no such method. */
  eraseMyAccount?(answers: { confirm: string; password: string; username: string }, opts?: { check?: boolean }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Report one of this door's own achievement events (achievements SP2/SP3).
   * The type must be `door.<command>.<slug>` for the running door; it goes
   * through the board's reporter and outbox like every BBS event. Returns
   * true when it was recorded. Optional: a board without achievements
   * configured, or an older backend, has no such method.
   */
  achievement?(type: string, opts?: { value?: number; key?: string }): boolean;
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
  notifications?(): import('../formats/notify').DoorNotificationsApi;
  /** Get user by ID */
  getUser(userId: string): Promise<User | null>;

  /** Who is on the board: one row per node with a logged-in caller. */
  getOnlineUsers(): OnlineNode[];

  /**
   * Send a PRIVATE message to a user, in the caller's conference.
   *
   * Three arguments, as the board has always implemented it
   * (`BBSApi.sendMessage`) - the declaration said two until 2026-09-22 and
   * any door that believed it posted a message with no body.
   */
  sendMessage(toUsername: string, subject: string, body: string): Promise<boolean>;

  /** Broadcast message to all users */
  broadcast(message: string): Promise<void>;

  /** Check user access level */
  hasAccess(userId: string, level: number): Promise<boolean>;

  /**
   * Where the caller's conference keeps its files, as a host path.
   *
   * The board's own resolver answers: a conference's directory is whatever
   * `LOCATION.n` says, not `Conf<n>` built from the number. Optional, because
   * a door may be running against an older backend - one that cannot answer
   * this cannot run a conference-scoped door at all, and the door should say
   * so rather than guess a path.
   */
  getConferencePath?(conferenceNumber?: number): string;

  /**
   * The ENABLED tooltypes of a `.info` file under the board's directory, as
   * `KEY` to value. A flag tooltype with no `=` comes back with an empty
   * value; a disabled one - `(KEY=value)` or `!KEY=value` - is not there at
   * all. Optional for the same reason as `getConferencePath`.
   */
  readTooltypes?(relativePath: string): Record<string, string>;

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

/**
 * Event handler for video frames
 */
/**
 * A frame, and WHO sent it.
 *
 * The sender used to be dropped here, so a door had no way to tell its own
 * camera from anybody else's and painted every frame it received into the
 * local user's tile: two people streaming meant one tile flipping between
 * two sizes while the other tile waited for video that had already been
 * spent on the wrong one.
 */
export type VideoFrameHandler = (frame: string, userId?: string | number, username?: string) => void;

/**
 * Video API - ASCII Video Streaming
 *
 * Provides real-time ASCII video streaming capabilities for doors.
 * Converts video sources (webcam, files, URLs) to ASCII art with 16-color ANSI palette.
 */
export interface VideoAPI {
  /**
   * Start streaming from a video source
   * @param source Video source configuration
   * @param options Stream options (width, height, fps, colors)
   * @returns Promise resolving to stream ID
   */
  startStream(source: VideoSource, options?: VideoStreamOptions): Promise<string>;

  /**
   * Register a handler for local video frames
   * @param handler Function to call when a new frame is available
   */
  onFrame(handler: VideoFrameHandler): void;

  /**
   * Stop an active stream
   * @param streamId Stream identifier
   */
  stopStream(streamId: string): Promise<void>;

  /**
   * Subscribe to a stream (for viewers)
   * @param streamId Stream identifier
   */
  subscribe(streamId: string): Promise<void>;

  /**
   * Unsubscribe from a stream
   * @param streamId Stream identifier
   */
  unsubscribe(streamId: string): Promise<void>;

  /**
   * Get all active streams
   * @returns Array of stream IDs
   */
  getStreams(): Promise<string[]>;

  /**
   * Pause a stream
   * @param streamId Stream identifier
   */
  pauseStream(streamId: string): Promise<void>;

  /**
   * Resume a paused stream
   * @param streamId Stream identifier
   */
  resumeStream(streamId: string): Promise<void>;
}

/**
 * Video source types
 */
export type VideoSource =
  | { type: 'webcam'; deviceId?: string }
  | { type: 'file'; path: string }
  | { type: 'url'; url: string }
  | { type: 'screen'; displayId?: number }
  | { type: 'buffer'; buffer: Buffer };

/**
 * Video stream options
 */
export interface VideoStreamOptions {
  /** ASCII output width in characters (default: 80) */
  width?: number;

  /** ASCII output height in characters (default: 24) */
  height?: number;

  /** Target frames per second (default: 10, max: 15) */
  fps?: number;

  /** Use ANSI colors (default: true, 16 colors only) */
  colored?: boolean;

  /** Character set for ASCII conversion */
  charSet?: 'blocks' | 'gradient' | 'simple';

  /**
   * Render mode for hybrid doors that do their own browser-side encoding
   * (livechat). Backend `video:data` pipeline supports `braille|superres|
   * halfblock|ascii|hsv|shape`; livechat's lightweight client supports the
   * subset below.
   */
  mode?: 'ascii' | 'color' | 'halfblock' | 'braille';
}

/**
 * Door lifecycle hooks (SDK v2.0)
 */
export type StartHandler = (ctx: DoorContext) => Promise<void> | void;
export type InputHandler = (ctx: DoorContext, key: KeyPress) => Promise<void> | void;
export type CloseHandler = (ctx: DoorContext) => Promise<void> | void;
export type ErrorHandler = (ctx: DoorContext, error: Error) => Promise<void> | void;

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

/**
 * Audio API - Real-Time Voice Chat
 *
 * Provides real-time audio streaming capabilities for doors.
 * Uses Opus codec with Socket.IO transport for voice chat.
 */
export interface AudioAPI {
  /**
   * Start streaming audio from microphone
   * @param options Stream configuration options
   * @returns Promise resolving to stream ID
   */
  startStreaming(options?: AudioStreamOptions): Promise<string>;

  /**
   * Stop streaming audio
   */
  stopStreaming(): Promise<void>;

  /**
   * Get all active audio streams in room
   * @returns Array of stream information
   */
  getActiveStreams(): AudioStreamInfo[];

  /**
   * Mute/unmute local microphone
   * @param muted True to mute, false to unmute
   */
  setMuted(muted: boolean): void;

  /**
   * Set volume for audio playback
   * @param volume Volume level (0.0 - 1.0)
   */
  setVolume(volume: number): void;

  /**
   * Get current audio levels for visualization
   * @returns Current input/output levels
   */
  getAudioLevels(): AudioLevels;

  /**
   * Subscribe to someone's audio stream
   * @param userId User ID to subscribe to
   */
  subscribe(userId: number | string): Promise<void>;

  /**
   * Unsubscribe from audio stream
   * @param userId User ID to unsubscribe from
   */
  unsubscribe(userId: number | string): Promise<void>;
}

/**
 * Audio stream configuration options
 */
export interface AudioStreamOptions {
  /** Audio codec (default: 'opus') */
  codec?: 'opus' | 'pcm';

  /** Sample rate in Hz (default: 48000) */
  sampleRate?: 48000 | 16000;

  /** Bitrate in bps (default: 32000 = 32kbps) */
  bitrate?: number;

  /** Enable echo cancellation (default: true) */
  echoCancellation?: boolean;

  /** Enable noise suppression (default: true) */
  noiseSuppression?: boolean;

  /** Enable auto gain control (default: true) */
  autoGainControl?: boolean;

  /** Number of audio channels (default: 1 = mono) */
  channelCount?: 1 | 2;

  /** Enable ASCII waveform visualization (default: false) */
  visualize?: boolean;
}

/**
 * Information about an active audio stream
 */
export interface AudioStreamInfo {
  /** User ID */
  userId: number | string;

  /** Username */
  username: string;

  /** Whether user is currently speaking (voice activity detection) */
  isSpeaking: boolean;

  /** Current audio level (0.0 - 1.0) */
  audioLevel: number;
}

/**
 * Audio levels for input/output monitoring
 */
export interface AudioLevels {
  /** Microphone input level (0.0 - 1.0) */
  input: number;

  /** Speaker output level (0.0 - 1.0) */
  output: number;

  /** Waveform data for visualization (array of -1.0 to 1.0 samples) */
  waveform?: number[];
}
