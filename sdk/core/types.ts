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
