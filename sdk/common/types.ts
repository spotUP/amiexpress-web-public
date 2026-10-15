/**
 * Shared Types for AmiExpress SDK
 * Used by both server and client runtimes
 */

/**
 * Door runtime type
 *
 * @deprecated 'client' runtime is deprecated - use 'hybrid' instead for browser features.
 * Hybrid doors work on ALL protocols (telnet, SSH, WebSocket) by providing:
 * - Browser component with Web Audio/Canvas/WebGL for WebSocket users
 * - Server component with text fallback for telnet/SSH users
 */
export type DoorRuntime = 'server' | 'client' | 'hybrid';

/**
 * BBS User Information
 */
export interface BBSUser {
  id: number;
  name: string;
  node: number;
  securityLevel: number;
  timeLeft: number;
  graphicsMode: 'ANSI' | 'ASCII' | 'RIP';
  termWidth: number;
  termHeight: number;
  data: Record<string, any>;
}

/**
 * Door Configuration
 */
export interface DoorConfig {
  name: string;
  version: string;
  author: string;
  description?: string;
  minSecurity?: number;
  maxTime?: number;
  multiplayer?: boolean;
  runtime?: DoorRuntime;
  hybrid?: boolean;
}

/**
 * Door Manifest (package.json extension)
 */
export interface DoorManifest extends DoorConfig {
  // Runtime configuration
  runtime: DoorRuntime;

  // Server/hybrid: Node.js entry point
  entry?: string;

  // Client/hybrid: Browser bundle
  client?: {
    entry: string;
    bundle?: string;
  };

  // Hybrid: Server component
  server?: {
    entry: string;
  };

  // Standard package.json fields
  main?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Keyboard Input Event
 */
export interface KeyEvent {
  key: string;
  code: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * Position (x, y coordinates)
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Door Events
 */
export type DoorEvent =
  | 'init'
  | 'start'
  | 'connect'
  | 'connect:denied'
  | 'disconnect'
  | 'input'
  | 'output'
  | 'update'
  | 'render'
  | 'pause'
  | 'resume'
  | 'shutdown';

/**
 * Event Handler Type
 */
export type EventHandler = (...args: any[]) => void | Promise<void>;

/**
 * ANSI Color Codes
 */
export enum AnsiColor {
  BLACK = 30,
  RED = 31,
  GREEN = 32,
  YELLOW = 33,
  BLUE = 34,
  MAGENTA = 35,
  CYAN = 36,
  WHITE = 37,
  BRIGHT_BLACK = 90,
  BRIGHT_RED = 91,
  BRIGHT_GREEN = 92,
  BRIGHT_YELLOW = 93,
  BRIGHT_BLUE = 94,
  BRIGHT_MAGENTA = 95,
  BRIGHT_CYAN = 96,
  BRIGHT_WHITE = 97,
}

/**
 * ANSI Background Color Codes
 */
export enum AnsiBgColor {
  BLACK = 40,
  RED = 41,
  GREEN = 42,
  YELLOW = 43,
  BLUE = 44,
  MAGENTA = 45,
  CYAN = 46,
  WHITE = 47,
  BRIGHT_BLACK = 100,
  BRIGHT_RED = 101,
  BRIGHT_GREEN = 102,
  BRIGHT_YELLOW = 103,
  BRIGHT_BLUE = 104,
  BRIGHT_MAGENTA = 105,
  BRIGHT_CYAN = 106,
  BRIGHT_WHITE = 107,
}
