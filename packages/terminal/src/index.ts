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

// Re-export xterm types for convenience
export type { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm';
