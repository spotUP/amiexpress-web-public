/**
 * BlessedLite - Lightweight UI Engine for BBS Terminals
 *
 * A browser-compatible alternative to neo-blessed that generates ANSI escape sequences
 * for terminal UIs without Node.js dependencies.
 *
 * Features:
 * - Widget system (boxes, text, lists, menus, forms)
 * - Layout management (absolute, relative positioning)
 * - ANSI rendering (colors, styles, box drawing)
 * - Event handling (keyboard, mouse)
 * - No Node.js dependencies - works in browser and Node.js
 */

// =============================================================================
// ANSI Escape Sequences
// =============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

export const ANSI = {
  // Cursor control
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  home: `${CSI}H`,
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  goto: (x: number, y: number) => `${CSI}${y};${x}H`,

  // Colors
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  blink: `${CSI}5m`,
  reverse: `${CSI}7m`,

  // Foreground colors
  fg: {
    black: `${CSI}30m`,
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
    brightRed: `${CSI}91m`,
    brightGreen: `${CSI}92m`,
    brightYellow: `${CSI}93m`,
    brightBlue: `${CSI}94m`,
    brightMagenta: `${CSI}95m`,
    brightCyan: `${CSI}96m`,
    brightWhite: `${CSI}97m`,
  },

  // Background colors
  bg: {
    black: `${CSI}40m`,
    red: `${CSI}41m`,
    green: `${CSI}42m`,
    yellow: `${CSI}43m`,
    blue: `${CSI}44m`,
    magenta: `${CSI}45m`,
    cyan: `${CSI}46m`,
    white: `${CSI}47m`,
    gray: `${CSI}100m`,
    brightRed: `${CSI}101m`,
    brightGreen: `${CSI}102m`,
    brightYellow: `${CSI}103m`,
    brightBlue: `${CSI}104m`,
    brightMagenta: `${CSI}105m`,
    brightCyan: `${CSI}106m`,
    brightWhite: `${CSI}107m`,
  },
};

// Box drawing characters (Unicode)
export const BOX = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeUp: '┴',
    teeDown: '┬',
    teeLeft: '┤',
    teeRight: '├',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    cross: '╬',
    teeUp: '╩',
    teeDown: '╦',
    teeLeft: '╣',
    teeRight: '╠',
  },
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeUp: '┴',
    teeDown: '┬',
    teeLeft: '┤',
    teeRight: '├',
  },
};

// =============================================================================
// Types
// =============================================================================

export type BorderStyle = 'single' | 'double' | 'rounded' | 'none';
export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface WidgetOptions {
  // Position and size
  left?: number | string;  // absolute position or percentage
  top?: number | string;
  width?: number | string;
  height?: number | string;

  // Appearance
  fg?: string;  // foreground ANSI color code
  bg?: string;  // background ANSI color code
  bold?: boolean;
  underline?: boolean;

  // Border
  border?: BorderStyle | {
    type: BorderStyle;
    fg?: string;
    bg?: string;
  };

  // Content
  content?: string;
  align?: Align;
  valign?: VAlign;

  // Behavior
  visible?: boolean;
  focusable?: boolean;
  padding?: number | { left?: number; right?: number; top?: number; bottom?: number };

  // Label (for boxes with titles)
  label?: string;
}

export interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}

// =============================================================================
// Base Widget Class
// =============================================================================

export class Widget {
  protected options: WidgetOptions;
  protected children: Widget[] = [];
  protected parent: Widget | null = null;
  protected position: Position = { left: 0, top: 0, width: 0, height: 0 };
  protected screen: Screen | null = null;

  constructor(options: WidgetOptions = {}) {
    this.options = {
      visible: true,
      focusable: false,
      align: 'left',
      valign: 'top',
      ...options,
    };
  }

  // Calculate absolute position based on parent and screen
  protected calculatePosition(screenWidth: number, screenHeight: number): Position {
    const opts = this.options;
    const parentPos = this.parent?.position || { left: 0, top: 0, width: screenWidth, height: screenHeight };

    // Calculate left
    let left = 0;
    if (typeof opts.left === 'number') {
      left = opts.left;
    } else if (typeof opts.left === 'string' && opts.left.endsWith('%')) {
      left = Math.floor((parentPos.width * parseInt(opts.left)) / 100);
    }

    // Calculate top
    let top = 0;
    if (typeof opts.top === 'number') {
      top = opts.top;
    } else if (typeof opts.top === 'string' && opts.top.endsWith('%')) {
      top = Math.floor((parentPos.height * parseInt(opts.top)) / 100);
    }

    // Calculate width
    let width = parentPos.width;
    if (typeof opts.width === 'number') {
      width = opts.width;
    } else if (typeof opts.width === 'string' && opts.width.endsWith('%')) {
      width = Math.floor((parentPos.width * parseInt(opts.width)) / 100);
    }

    // Calculate height
    let height = parentPos.height;
    if (typeof opts.height === 'number') {
      height = opts.height;
    } else if (typeof opts.height === 'string' && opts.height.endsWith('%')) {
      height = Math.floor((parentPos.height * parseInt(opts.height)) / 100);
    }

    return {
      left: parentPos.left + left,
      top: parentPos.top + top,
      width: Math.max(0, width),
      height: Math.max(0, height),
    };
  }

  // Render widget to ANSI string
  render(screenWidth: number, screenHeight: number): string {
    if (!this.options.visible) return '';

    this.position = this.calculatePosition(screenWidth, screenHeight);

    let output = '';

    // Render border
    if (this.options.border && this.options.border !== 'none') {
      output += this.renderBorder();
    }

    // Render content
    if (this.options.content) {
      output += this.renderContent();
    }

    // Render children
    for (const child of this.children) {
      output += child.render(screenWidth, screenHeight);
    }

    return output;
  }

  protected renderBorder(): string {
    const pos = this.position;
    const borderType = typeof this.options.border === 'string'
      ? this.options.border
      : this.options.border!.type;

    if (borderType === 'none') return '';

    const box = BOX[borderType];
    const borderFg = typeof this.options.border === 'object' && this.options.border.fg
      ? this.options.border.fg
      : this.options.fg || '';
    const borderBg = typeof this.options.border === 'object' && this.options.border.bg
      ? this.options.border.bg
      : this.options.bg || '';

    let output = borderFg + borderBg;

    // Top border
    output += ANSI.goto(pos.left + 1, pos.top + 1);
    output += box.topLeft + box.horizontal.repeat(Math.max(0, pos.width - 2)) + box.topRight;

    // Side borders
    for (let y = 1; y < pos.height - 1; y++) {
      output += ANSI.goto(pos.left + 1, pos.top + y + 1);
      output += box.vertical;
      output += ANSI.goto(pos.left + pos.width, pos.top + y + 1);
      output += box.vertical;
    }

    // Bottom border
    output += ANSI.goto(pos.left + 1, pos.top + pos.height);
    output += box.bottomLeft + box.horizontal.repeat(Math.max(0, pos.width - 2)) + box.bottomRight;

    // Label (title)
    if (this.options.label) {
      const labelText = ` ${this.options.label} `;
      const labelX = pos.left + 2;
      output += ANSI.goto(labelX, pos.top + 1);
      output += labelText.substring(0, Math.max(0, pos.width - 4));
    }

    output += ANSI.reset;
    return output;
  }

  protected renderContent(): string {
    const pos = this.position;
    const hasBorder = this.options.border && this.options.border !== 'none';

    // Calculate content area
    const padding = typeof this.options.padding === 'number'
      ? { left: this.options.padding, right: this.options.padding, top: this.options.padding, bottom: this.options.padding }
      : { left: 0, right: 0, top: 0, bottom: 0, ...this.options.padding };

    const contentLeft = pos.left + (hasBorder ? 1 : 0) + padding.left!;
    const contentTop = pos.top + (hasBorder ? 1 : 0) + padding.top!;
    const contentWidth = pos.width - (hasBorder ? 2 : 0) - padding.left! - padding.right!;
    const contentHeight = pos.height - (hasBorder ? 2 : 0) - padding.top! - padding.bottom!;

    if (contentWidth <= 0 || contentHeight <= 0) return '';

    const fg = this.options.fg || '';
    const bg = this.options.bg || '';
    const bold = this.options.bold ? ANSI.bold : '';
    const underline = this.options.underline ? ANSI.underline : '';

    let output = fg + bg + bold + underline;

    // Split content into lines
    const lines = (this.options.content || '').split('\n');

    // Vertical alignment
    let startY = 0;
    if (this.options.valign === 'middle') {
      startY = Math.floor((contentHeight - lines.length) / 2);
    } else if (this.options.valign === 'bottom') {
      startY = contentHeight - lines.length;
    }

    // Render each line
    for (let i = 0; i < Math.min(lines.length, contentHeight); i++) {
      const y = contentTop + startY + i + 1;
      if (y < contentTop + 1 || y > contentTop + contentHeight) continue;

      let line = lines[i];

      // Horizontal alignment
      if (this.options.align === 'center') {
        const padding = Math.floor((contentWidth - line.length) / 2);
        line = ' '.repeat(Math.max(0, padding)) + line;
      } else if (this.options.align === 'right') {
        const padding = contentWidth - line.length;
        line = ' '.repeat(Math.max(0, padding)) + line;
      }

      // Truncate to fit width
      line = line.substring(0, contentWidth);

      output += ANSI.goto(contentLeft + 1, y);
      output += line;
    }

    output += ANSI.reset;
    return output;
  }

  // Widget tree management
  append(child: Widget): void {
    child.parent = this;
    child.screen = this.screen;
    this.children.push(child);
  }

  remove(child: Widget): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
      child.screen = null;
    }
  }

  // Property setters
  setContent(content: string): void {
    this.options.content = content;
  }

  setText(text: string): void {
    this.setContent(text);
  }

  setLabel(label: string): void {
    this.options.label = label;
  }

  show(): void {
    this.options.visible = true;
  }

  hide(): void {
    this.options.visible = false;
  }

  focus(): void {
    if (this.screen && this.options.focusable) {
      this.screen.focused = this;
    }
  }
}

// =============================================================================
// Specific Widget Types
// =============================================================================

export class Box extends Widget {
  constructor(options: WidgetOptions = {}) {
    super(options);
  }
}

export class Text extends Widget {
  constructor(options: WidgetOptions = {}) {
    super({ ...options, border: 'none' });
  }
}

export class List extends Widget {
  private items: string[] = [];
  private selected: number = 0;

  constructor(options: WidgetOptions & { items?: string[] } = {}) {
    super(options);
    this.items = options.items || [];
  }

  setItems(items: string[]): void {
    this.items = items;
    this.selected = Math.min(this.selected, items.length - 1);
  }

  select(index: number): void {
    this.selected = Math.max(0, Math.min(index, this.items.length - 1));
  }

  protected renderContent(): string {
    // Build content from items with selection marker
    const content = this.items.map((item, i) => {
      const marker = i === this.selected ? '> ' : '  ';
      return marker + item;
    }).join('\n');

    this.options.content = content;
    return super.renderContent();
  }

  getSelected(): number {
    return this.selected;
  }

  getSelectedItem(): string | undefined {
    return this.items[this.selected];
  }
}

export class Menu extends List {
  constructor(options: WidgetOptions & { items?: string[] } = {}) {
    super({ border: 'single', ...options });
  }
}

// =============================================================================
// Screen Class (Root Container)
// =============================================================================

export class Screen extends Widget {
  width: number;
  height: number;
  focused: Widget | null = null;

  constructor(width: number = 80, height: number = 24) {
    super({ width, height, left: 0, top: 0 });
    this.width = width;
    this.height = height;
    this.screen = this;
  }

  render(): string {
    let output = ANSI.clear + ANSI.home;
    output += super.render(this.width, this.height);
    return output;
  }

  // Event handling (to be extended)
  onKey(handler: (key: string) => void): void {
    // Hook for key events
  }

  onMouse(handler: (event: any) => void): void {
    // Hook for mouse events
  }
}

// =============================================================================
// Factory Functions (blessed-style API)
// =============================================================================

export function screen(options?: { width?: number; height?: number }): Screen {
  return new Screen(options?.width, options?.height);
}

export function box(options?: WidgetOptions): Box {
  return new Box(options);
}

export function text(options?: WidgetOptions): Text {
  return new Text(options);
}

export function list(options?: WidgetOptions & { items?: string[] }): List {
  return new List(options);
}

export function menu(options?: WidgetOptions & { items?: string[] }): Menu {
  return new Menu(options);
}

// =============================================================================
// Export everything
// =============================================================================

export default {
  screen,
  box,
  text,
  list,
  menu,
  Screen,
  Box,
  Text,
  List,
  Menu,
  Widget,
  ANSI,
  BOX,
};
