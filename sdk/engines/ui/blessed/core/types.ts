/**
 * Type definitions for Blessed UI engine
 */

// ============================================================================
// Color and Style Types
// ============================================================================

export type Color = string | number;

export interface Colors {
  fg?: Color;
  bg?: Color;
  bold?: Color | boolean;
  underline?: Color | boolean;
  blink?: Color | boolean;
  inverse?: Color | boolean;
  invisible?: Color | boolean;
  transparent?: boolean;  // Enable 50% opacity color blending
  opacity?: number;  // Web-only: CSS opacity for element (0-1). Emits OSC overlay event for web clients.
}

export interface Border {
  type?: 'line' | 'bg' | 'none' | 'heavy' | 'double' | 'round' | 'ascii';
  fg?: Color;
  bg?: Color;
  ch?: string;
  style?: Colors;
  label?: string;
  labelStyle?: Colors;
  labelPosition?: 'left' | 'center' | 'right';
}

export interface Padding {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface Position {
  // Calculated absolute coordinates (always set)
  xi: number;  // absolute left
  xl: number;  // absolute right
  yi: number;  // absolute top
  yl: number;  // absolute bottom

  // User-specified positioning (optional, set by position setters)
  // Note: Can be null (explicitly cleared) or undefined (never set)
  left?: number | string | null;
  right?: number | string | null;
  top?: number | string | null;
  bottom?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
}

// ============================================================================
// Layout Types
// ============================================================================

export type TPosition = number | string;  // Can be: 10, '50%', 'center', etc.

export interface ElementOptions {
  // Position and size
  left?: TPosition;
  right?: TPosition;
  top?: TPosition;
  bottom?: TPosition;
  width?: TPosition;
  height?: TPosition;
  fixed?: boolean;  // Fixed positioning (relative to screen, not parent)

  // Alignment helpers
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';

  // Style
  style?: Colors & {
    border?: Colors;
    scrollbar?: Colors;
    focus?: Colors;
    hover?: Colors;
  };

  border?: Border | 'line' | 'bg';
  padding?: number | Padding;
  shadow?: boolean;  // Enable shadow effect
  ch?: string;  // Character to fill background with (default: ' ')

  // Content
  content?: string;
  tags?: boolean;  // Enable tag parsing
  wrap?: boolean;  // Word wrap content (default: true)

  // Behavior
  hidden?: boolean;
  focusable?: boolean;
  clickable?: boolean;
  keyable?: boolean;
  keys?: boolean | string[];  // Enable key bindings (true/false or custom key array)
  vi?: boolean;  // Enable vi-style navigation (j/k for up/down)
  input?: boolean;
  draggable?: boolean;  // Enable drag-and-drop with mouse
  dockBorders?: boolean;
  ignoreDockContrast?: boolean;

  // Scrolling
  scrollable?: boolean;
  alwaysScroll?: boolean;
  scrollbar?: {
    ch?: string;
    track?: {
      ch?: string;
    };
    style?: Colors;
  };
  baseLimit?: number;

  // Mouse
  mouse?: boolean;
  hoverText?: string;  // Tooltip text shown on hover

  // Label
  label?: string;

  // Parent
  parent?: Element;

  // Screen
  screen?: Screen;
}

// ============================================================================
// Event Types
// ============================================================================

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  full: string;
}

export interface MouseEvent {
  x: number;
  y: number;
  action: 'mousedown' | 'mouseup' | 'mousemove' | 'wheeldown' | 'wheelup';
  button?: 'left' | 'middle' | 'right';
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export type EventHandler = (...args: any[]) => void;

// ============================================================================
// Screen Types
// ============================================================================

export interface ScreenOptions {
  program?: any;
  smartCSR?: boolean;
  fastCSR?: boolean;
  resizeTimeout?: number;
  tabSize?: number;
  autoPadding?: boolean;
  height?: number;
  style?: ElementOptions['style'];
  cursor?: {
    artificial?: boolean;
    shape?: 'block' | 'underline' | 'line';
    blink?: boolean;
    color?: Color;
  };
  log?: string;
  dump?: boolean;
  debug?: boolean;
  warnings?: boolean;
  title?: string;
  fullUnicode?: boolean;
  dockBorders?: boolean;
  ignoreDockContrast?: boolean;
  ignoreLocked?: string[];
  forceUnicode?: boolean;
  terminal?: string;
  tput?: boolean;
}

// ============================================================================
// Widget-specific Types
// ============================================================================

export interface ListOptions extends ElementOptions {
  items?: string[];
  selected?: number;
  interactive?: boolean;
  keys?: boolean;
  vi?: boolean;
  wrapItems?: boolean;
  style?: ElementOptions['style'] & {
    selected?: Colors;
    item?: Colors;
  };
}

export interface FormOptions extends ElementOptions {
  keys?: boolean;
  vi?: boolean;
}

export interface TextboxOptions extends ElementOptions {
  keys?: boolean;
  mouse?: boolean;
  inputOnFocus?: boolean;
  value?: string;
  secret?: boolean;
  censor?: boolean;
}

export interface ButtonOptions extends ElementOptions {
  keys?: boolean;
  mouse?: boolean;
}

export interface ProgressBarOptions extends ElementOptions {
  orientation?: 'horizontal' | 'vertical';
  filled?: number;
  value?: number;
  keys?: boolean;
  mouse?: boolean;
  ch?: string;
  pch?: string;
}

export interface TableOptions extends ElementOptions {
  rows?: string[][];
  data?: string[][];
  headers?: string[];
  columnWidth?: number[];
  columnSpacing?: number;
  pad?: number;
  noCellBorders?: boolean;
  fillCellBorders?: boolean;
  style?: ElementOptions['style'] & {
    header?: Colors;
    cell?: Colors;
  };
}

export interface FileManagerOptions extends ElementOptions {
  cwd?: string;
  keys?: boolean;
  vi?: boolean;
  style?: ElementOptions['style'] & {
    selected?: Colors;
  };
}

export interface LogOptions extends ElementOptions {
  scrollback?: number;
  scrollOnInput?: boolean;
}

// ============================================================================
// Forward Declarations
// ============================================================================

export interface Element {
  options: ElementOptions;
  parent: Element | null;
  screen: Screen | null;
  children: Element[];

  // Position
  position: Position;
  lpos?: Position;

  // Content
  content: string;

  // Methods
  render(): void;
  setContent(content: string): void;
  getContent(): string;
  setText(text: string): void;
  getText(): string;
  insertLine(i: number, line: string): void;
  deleteLine(i: number): void;
  getLine(i: number): string;
  getLines(): string[];
  setLine(i: number, line: string): void;
  clearLine(i: number): void;
  insertTop(line: string): void;
  insertBottom(line: string): void;

  // Tree
  append(element: Element): void;
  prepend(element: Element): void;
  remove(element: Element): void;
  insert(element: Element, i: number): void;
  insertBefore(element: Element, other: Element): void;
  insertAfter(element: Element, other: Element): void;
  detach(): void;

  // Events
  on(event: string, handler: EventHandler): void;
  once(event: string, handler: EventHandler): void;
  removeListener(event: string, handler: EventHandler): void;
  emit(event: string, ...args: any[]): void;

  // Focus
  focus(): void;

  // Visibility
  show(): void;
  hide(): void;
  toggle(): void;

  // Positioning
  setFront(): void;
  setBack(): void;

  // Scrolling
  scroll(offset: number): void;
  scrollTo(index: number): void;
  getScroll(): number;
  setScroll(index: number): void;
  getScrollHeight(): number;
  getScrollPerc(): number;
  setScrollPerc(perc: number): void;
  resetScroll(): void;

  // Destroy
  destroy(): void;
  free(): void;
}

export interface Screen extends Element {
  width: number;
  height: number;
  focused: Element | null;

  // Rendering
  render(): void;
  draw(start: number, end: number): void;
  clearRegion(xi: number, xl: number, yi: number, yl: number): void;
  fillRegion(attr: string, ch: string, xi: number, xl: number, yi: number, yl: number): void;

  // Focus
  focusPush(element: Element): void;
  focusPop(): Element;
  saveFocus(): Element;
  restoreFocus(): Element;
  rewindFocus(): void;

  // Program control
  key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
  onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
  unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;

  // Title
  setTitle(title: string): void;

  // Cursor
  showCursor(): void;
  hideCursor(): void;

  // Cleanup
  destroy(): void;
}
