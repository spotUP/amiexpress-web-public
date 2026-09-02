/**
 * @amiexpress/terminal
 *
 * Shared terminal components and utilities for AmiExpress BBS and SDK
 */

// Export terminal components
export {
  BBSTerminal,
  type BBSTerminalRef,
  type TerminalCell,
  type TerminalMouseEventType,
  type TerminalMouseModifiers,
} from './components/BBSTerminal';

// Export terminal utilities and configuration
export {
  ANSI,
  buildTerminalBuffer,
  XTERM_CONFIG,
} from './utils/terminal-utils';
export {
  keyOverride,
  classifyKey,
  type KeyLike,
  type TerminalKeyState,
  type TerminalKeyAction,
} from './utils/key-overrides';
export {
  toggleFullscreen,
  isFullscreen,
  type FullscreenDocument,
  type FullscreenTarget,
} from './utils/fullscreen';

// Export true-PETSCII (C64 screen-editor emulation) components and utilities
export { PetsciiMachine, type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';
export { PetsciiCanvas, type PetsciiCanvasProps } from './petscii/PetsciiCanvas';
export { keyEventToPetscii } from './petscii/keymap';
export { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from '@amiexpress/bbs-door-sdk/petscii';

// Re-export xterm types for convenience
export type { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm';
