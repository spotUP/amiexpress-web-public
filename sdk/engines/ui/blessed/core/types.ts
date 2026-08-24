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

/**
 * Style for a state variant (focus / hover / active / disabled).
 *
 * Same as Colors but may also restyle the element's border - every renderer
 * already reads `style.focus.border` / `style.hover.border` /
 * `style.disabled.border` (see Screen._renderBorder and
 * Element.renderBorderWithLabel), but the state styles were typed as plain
 * `Colors`, so declaring a focus border was a TypeScript error despite
 * being fully supported at runtime.
 */
export interface StateColors extends Colors {
  border?: Colors;
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
  // Per-edge colors (override fg for specific edges)
  fgTop?: Color;
  fgBottom?: Color;
  fgLeft?: Color;
  fgRight?: Color;
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
    focus?: StateColors;
    hover?: StateColors;
    active?: StateColors;
    disabled?: StateColors;
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
  disabled?: boolean;  // Disable interaction (grayed out, not focusable/clickable)
  zIndex?: number;     // Rendering order (higher = front)

  // Focus management
  tabIndex?: number;  // Tab order (0 = natural order, -1 = not tabbable, 1+ = explicit order)
  tabbable?: boolean;  // Can be reached via Tab key (default: same as focusable)

  // Scrolling
  scrollable?: boolean;
  alwaysScroll?: boolean;
  scrollbar?: {
    ch?: string;
    thumb?: {
      ch?: string;
    };
    track?: {
      ch?: string;
      style?: Colors;
    };
    style?: Colors;
  };
  baseLimit?: number;

  // Mouse
  mouse?: boolean;
  hoverText?: string;  // Tooltip text shown on hover
  cursorStyle?: string;  // CSS cursor style on hover ('pointer', 'move', 'text', etc.)

  // Modal/Dialog features
  closable?: boolean;  // Add X close button and ESC key binding
  closeOnEscape?: boolean;  // Close on ESC key (default: true when closable)
  trapFocus?: boolean;  // Trap focus and suppress global keys while visible

  // Responsive/Mobile features
  responsive?: boolean;  // Enable responsive behavior (default: true)
  touchFriendly?: boolean;  // Enable touch-friendly sizing (min 3 rows height)
  swipeEnabled?: boolean;  // Enable swipe gesture detection
  mobileBreakpoint?: number;  // Custom breakpoint for mobile detection (default: 50)

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
  input?: any;
  smartCSR?: boolean;
  fastCSR?: boolean;
  resizeTimeout?: number;
  tabSize?: number;
  autoPadding?: boolean;
  width?: number;
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
  responsive?: boolean;
  focusKeys?: boolean;
  breakpoints?: {
    small?: number;
    medium?: number;
    large?: number;
  };
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
  track?: boolean;  // Enable mouse hover tracking for list items
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

export interface TreeNode {
  name?: string;
  extended?: boolean;
  children?: TreeNode[] | Record<string, TreeNode> | ((node: TreeNode) => TreeNode[] | Record<string, TreeNode>);
  childrenContent?: TreeNode[] | Record<string, TreeNode>;
  parent?: TreeNode | null;
  position?: number;
  depth?: number;
}

export interface TreeTemplate {
  extend?: string;
  retract?: string;
  lines?: boolean;
  spaces?: boolean;
}

export interface TreeOptions extends ElementOptions {
  extended?: boolean;
  keys?: string[] | boolean;
  vi?: boolean;
  mouse?: boolean;
  scrollable?: boolean;
  ignoreKeys?: string[];
  template?: TreeTemplate;
  selectedBg?: string | number | number[];
  selectedFg?: string | number | number[];
  bold?: boolean;
}

export interface AutocompleteSuggestion {
  label: string;
  insertText?: string;
  detail?: string;
  kind?: 'text' | 'keyword' | 'function' | 'variable' | 'user';
  sortText?: string;
  documentation?: string;
}

export interface AutocompleteContext {
  currentLine: string;
  cursorPosition: number;
  lineNumber: number;
  documentContent: string[];
}

export interface AutocompleteProvider {
  trigger?: string;
  shouldTrigger?: (context: AutocompleteContext) => boolean;
  getSuggestions: (context: AutocompleteContext) => Promise<AutocompleteSuggestion[]>;
}

export interface AutocompleteOptions extends ElementOptions {
  providers?: AutocompleteProvider[];
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  onCancel?: () => void;
}

export interface VideoOptions extends ElementOptions {
  src?: string;
  file?: string;
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  muted?: boolean;
}

export interface TabPanelOptions extends ElementOptions {
  tabs?: {
    label: string;
    content: string | any;
    key?: string;
  }[];
  activeTab?: number;
  barHeight?: number;
  style?: ElementOptions['style'] & {
    tab?: Colors;
    activeTab?: Colors;
  };
}

export interface AccordionItem {
  label: string;
  content: string | any;
  expanded?: boolean;
}

export interface AccordionOptions extends ElementOptions {
  items?: AccordionItem[];
  multiple?: boolean;  // Allow multiple sections to be expanded at once
  style?: ElementOptions['style'] & {
    header?: Colors;
    expanded?: Colors;
  };
}

export interface CollapsibleOptions extends ElementOptions {
  label?: string;
  expanded?: boolean;
  collapsedHeight?: number;
  style?: ElementOptions['style'] & {
    header?: Colors;
  };
}

export interface StackedGaugeOptions extends ElementOptions {
  stack?: {
    percent: number;
    color: string;
    label?: string;
  }[];
  showLabel?: boolean;
}

export interface ColorPickerOptions extends ElementOptions {
  color?: string;
  onSelect?: (color: string) => void;
}

export interface FileExplorerOptions extends ElementOptions {
  cwd?: string;
  showPreview?: boolean;
  showDetails?: boolean;
}

export interface CarouselOptions {
  screen: Screen;
  interval?: number;
  controlKeys?: boolean;
  rotate?: boolean;
}

export type CarouselPage = (screen: Screen, page: number) => void;

// ============================================================================
// Forward Declarations
// ============================================================================

export interface Element {
  options: ElementOptions;
  style: Colors & {
    border?: Colors;
    scrollbar?: Colors;
    focus?: StateColors;
    hover?: StateColors;
    active?: StateColors;
    disabled?: StateColors;
  };
  border: Border | null;
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

  // Mouse
  onMouse(event: MouseEvent): boolean;

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
  off(event: string, handler: EventHandler): void;  // Alias for removeListener
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
