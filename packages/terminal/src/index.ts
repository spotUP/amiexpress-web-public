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
// The single owner of the BBS session font: the default, the CSS stack,
// the line-height map, the pre-login cache and the applier.
export {
  DEFAULT_BBS_FONT,
  BBS_FONTS,
  FONT_CACHE_KEY,
  FALLBACK_FONT_STACK,
  fontFamilyFor,
  lineHeightFor,
  isBbsFont,
  readCachedFont,
  writeCachedFont,
  waitForFontFace,
  forceRemeasure,
  applyFont,
  type BbsFont,
  type FontTarget,
} from './utils/session-font';
// The single owner of the terminal ZOOM: the factor, its range, the preset
// ladder, the gesture arithmetic and the per-viewer memory. Zoom is a factor
// over the page's base cell size, never a second size - see the module header.
export {
  ZOOM_STORAGE_KEY,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_PRESETS,
  ZOOM_CORNERS,
  CORNER_HIT_PX,
  BOX_MAX_WIDTH_PX,
  clampZoom,
  zoomedFontSize,
  zoomedBoxMaxWidth,
  isZoomWheel,
  wheelZoom,
  nextPreset,
  cornerAt,
  cursorForCorner,
  isBezelPoint,
  dragZoom,
  fitZoomToViewport,
  readStoredZoom,
  writeStoredZoom,
  type ZoomCorner,
  type ZoomPoint,
  type ZoomRect,
  type ZoomSize,
  type ZoomWheelLike,
} from './utils/terminal-zoom';

// Export true-PETSCII (C64 screen-editor emulation) components and utilities
export { PetsciiMachine, type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';
export { PetsciiCanvas, type PetsciiCanvasProps, type PetsciiCanvasHandle } from './petscii/PetsciiCanvas';
export { keyEventToPetscii } from './petscii/keymap';
export { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from '@amiexpress/bbs-door-sdk/petscii';

// Re-export xterm types for convenience
export type { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm';
