/**
 * Block Sprite Engine - Type Definitions
 *
 * Core interfaces and types for the ANSI block sprite system.
 */

/**
 * Standard ANSI colors (16-color palette)
 */
export type AnsiColor =
  | 'black' | 'red' | 'green' | 'yellow'
  | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'gray' | 'brightRed' | 'brightGreen' | 'brightYellow'
  | 'brightBlue' | 'brightMagenta' | 'brightCyan' | 'brightWhite';

/**
 * Block character with color information
 */
export interface BlockChar {
  /** Block character (e.g., '█', '▀', '▄', etc.) */
  char: string;
  /** Foreground color */
  fg?: AnsiColor;
  /** Background color */
  bg?: AnsiColor;
  /** If true, this cell is transparent and won't be rendered */
  transparent?: boolean;
}

/**
 * A cell in the sprite data - can be a full BlockChar, just a string, or null for transparent
 */
export type BlockCell = BlockChar | string | null;

/**
 * A single frame of animation
 */
export interface BlockFrame {
  /** Frame width in characters */
  width: number;
  /** Frame height in characters */
  height: number;
  /** 2D array of block cells [row][col] */
  data: BlockCell[][];
  /** Frame duration in milliseconds (default: 100) */
  duration?: number;
  /** Origin point for rotation/positioning (default: {x: 0, y: 0}) */
  origin?: { x: number; y: number };
}

/**
 * Hitbox definition for collision detection
 */
export interface Hitbox {
  /** X offset from sprite position */
  x: number;
  /** Y offset from sprite position */
  y: number;
  /** Hitbox width */
  width: number;
  /** Hitbox height */
  height: number;
}

/**
 * Animation definition with multiple frames
 */
export interface BlockAnimation {
  /** Animation name/id */
  name: string;
  /** Frames in this animation */
  frames: BlockFrame[];
  /** Whether animation loops (default: true) */
  loop?: boolean;
  /** Animation speed multiplier (default: 1.0) */
  speed?: number;
}

/**
 * Sprite instance configuration
 */
export interface BlockSpriteConfig {
  /** Unique sprite identifier */
  id: string;
  /** X position in character cells */
  x?: number;
  /** Y position in character cells */
  y?: number;
  /** Z-index for layering (higher = on top) */
  z?: number;
  /** Animation frames */
  frames: BlockFrame[];
  /** Named animations (optional, for complex sprites) */
  animations?: Record<string, BlockAnimation>;
  /** Whether sprite is visible */
  visible?: boolean;
  /** Whether animation is playing */
  playing?: boolean;
  /** Whether animation loops */
  loop?: boolean;
  /** Animation speed multiplier */
  speed?: number;
  /** Flip sprite horizontally */
  flipX?: boolean;
  /** Flip sprite vertically */
  flipY?: boolean;
  /** Custom hitbox (defaults to frame dimensions) */
  hitbox?: Hitbox;
  /** User data attached to sprite */
  data?: Record<string, unknown>;
}

/**
 * Live sprite instance
 */
export interface BlockSprite {
  /** Unique sprite identifier */
  id: string;
  /** X position in character cells */
  x: number;
  /** Y position in character cells */
  y: number;
  /** Z-index for layering */
  z: number;
  /** All frames */
  frames: BlockFrame[];
  /** Named animations */
  animations: Record<string, BlockAnimation>;
  /** Current animation name (null = use frames directly) */
  currentAnimation: string | null;
  /** Current frame index */
  currentFrame: number;
  /** Time accumulator for frame timing */
  frameTime: number;
  /** Whether animation is playing */
  playing: boolean;
  /** Whether animation loops */
  loop: boolean;
  /** Animation speed multiplier */
  speed: number;
  /** Whether sprite is visible */
  visible: boolean;
  /** Flip horizontally */
  flipX: boolean;
  /** Flip vertically */
  flipY: boolean;
  /** Collision hitbox */
  hitbox: Hitbox | null;
  /** User data */
  data: Record<string, unknown>;
  /** Callback when animation completes (for non-looping) */
  onComplete?: () => void;
}

/**
 * Buffer cell for the render buffer
 */
export interface BufferCell {
  /** Character to display */
  char: string;
  /** Foreground color */
  fg: AnsiColor;
  /** Background color */
  bg: AnsiColor;
  /** Whether this cell has been written to */
  dirty: boolean;
}

/**
 * Engine configuration
 */
export interface BlockSpriteEngineConfig {
  /** Buffer width in characters */
  width: number;
  /** Buffer height in characters */
  height: number;
  /** Default foreground color */
  defaultFg?: AnsiColor;
  /** Default background color */
  defaultBg?: AnsiColor;
  /** Enable dirty rectangle optimization */
  enableDirtyRects?: boolean;
  /** Enable double buffering */
  doubleBuffer?: boolean;
}

/**
 * Rectangle for dirty rect tracking
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Collision result
 */
export interface CollisionResult {
  /** Whether collision occurred */
  collided: boolean;
  /** Overlap area (if collided) */
  overlap?: Rect;
  /** First sprite in collision */
  spriteA?: BlockSprite;
  /** Second sprite in collision */
  spriteB?: BlockSprite;
}

/**
 * Point for position checks
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Sprite sheet definition for loading from data
 */
export interface SpriteSheetDef {
  /** Sheet name/id */
  name: string;
  /** Character width of each sprite cell */
  cellWidth: number;
  /** Character height of each sprite cell */
  cellHeight: number;
  /** Sprite definitions */
  sprites: Record<string, {
    /** Cell positions [col, row] for each frame */
    cells: [number, number][];
    /** Frame duration (ms) */
    duration?: number;
    /** Origin point */
    origin?: { x: number; y: number };
    /** Hitbox */
    hitbox?: Hitbox;
  }>;
  /** The actual sprite data - 2D array */
  data: BlockCell[][];
}

/**
 * Animation state for tracking playback
 */
export interface AnimationState {
  /** Current animation name */
  animation: string | null;
  /** Current frame index */
  frame: number;
  /** Time accumulated on current frame */
  time: number;
  /** Whether animation is playing */
  playing: boolean;
  /** Whether animation has completed (for non-looping) */
  completed: boolean;
}

/**
 * Event types emitted by the engine
 */
export type BlockSpriteEvent =
  | { type: 'animationComplete'; sprite: BlockSprite; animation: string }
  | { type: 'collision'; a: BlockSprite; b: BlockSprite }
  | { type: 'spriteAdded'; sprite: BlockSprite }
  | { type: 'spriteRemoved'; spriteId: string };

/**
 * Event listener callback
 */
export type BlockSpriteEventListener = (event: BlockSpriteEvent) => void;
