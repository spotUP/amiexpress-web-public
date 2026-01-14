/**
 * Character picker dialog
 * Shows CP437 character set for selection
 */

import { box, list, type Screen, type Box, type List } from '../../blessed';
import type { EditorState } from '../core/editor-state';

/**
 * CP437 character set (IBM PC Extended ASCII)
 * Characters 0-255 in CP437 encoding
 */
const CP437_CHARS = [
  // 0x00-0x1F: Control characters (represented as special glyphs in CP437)
  '\u0000', '☺', '☻', '♥', '♦', '♣', '♠', '•', '◘', '○', '◙', '♂', '♀', '♪', '♫', '☼',
  '►', '◄', '↕', '‼', '¶', '§', '▬', '↨', '↑', '↓', '→', '←', '∟', '↔', '▲', '▼',

  // 0x20-0x7F: Standard ASCII
  ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_',
  '`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~', '⌂',

  // 0x80-0xFF: Extended ASCII (CP437)
  'Ç', 'ü', 'é', 'â', 'ä', 'à', 'å', 'ç', 'ê', 'ë', 'è', 'ï', 'î', 'ì', 'Ä', 'Å',
  'É', 'æ', 'Æ', 'ô', 'ö', 'ò', 'û', 'ù', 'ÿ', 'Ö', 'Ü', '¢', '£', '¥', '₧', 'ƒ',
  'á', 'í', 'ó', 'ú', 'ñ', 'Ñ', 'ª', 'º', '¿', '⌐', '¬', '½', '¼', '¡', '«', '»',
  '░', '▒', '▓', '│', '┤', '╡', '╢', '╖', '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐',
  '└', '┴', '┬', '├', '─', '┼', '╞', '╟', '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧',
  '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘', '┌', '█', '▄', '▌', '▐', '▀',
  'α', 'ß', 'Γ', 'π', 'Σ', 'σ', 'µ', 'τ', 'Φ', 'Θ', 'Ω', 'δ', '∞', 'φ', 'ε', '∩',
  '≡', '±', '≥', '≤', '⌠', '⌡', '÷', '≈', '°', '∙', '·', '√', 'ⁿ', '²', '■', '\u00A0'
];

/**
 * Common drawing characters (subset of CP437)
 */
const COMMON_DRAWING_CHARS = [
  // Box drawing
  '│', '─', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
  '║', '═', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
  '╒', '╓', '╕', '╖', '╘', '╙', '╛', '╜', '╞', '╟', '╡', '╢', '╤', '╥', '╧', '╨', '╪', '╫',

  // Blocks
  '█', '▄', '▌', '▐', '▀', '▓', '▒', '░',

  // Arrows and symbols
  '↑', '↓', '→', '←', '↔', '↕', '►', '◄', '▲', '▼',
  '☺', '☻', '♥', '♦', '♣', '♠', '•', '○', '◘', '◙',
  '♂', '♀', '♪', '♫', '☼', '§', '¶', '▬',

  // Math and special
  '≈', '≥', '≤', '≡', '±', '÷', '×', '√', '°', '∙', '·'
];

/**
 * Character picker options
 */
export interface CharacterPickerOptions {
  parent: Screen;
  state: EditorState;
  mode?: 'all' | 'common'; // Show all CP437 or just common drawing chars
  onSelect?: (char: string) => void;
  onCancel?: () => void;
}

/**
 * Character picker dialog
 */
export class CharacterPicker {
  private dialog: Box;
  private charList: List;
  private state: EditorState;
  private mode: 'all' | 'common';
  private onSelectCallback?: (char: string) => void;
  private onCancelCallback?: () => void;

  constructor(options: CharacterPickerOptions) {
    this.state = options.state;
    this.mode = options.mode || 'common';
    this.onSelectCallback = options.onSelect;
    this.onCancelCallback = options.onCancel;

    // Create dialog box
    this.dialog = box({
      parent: options.parent,
      top: 'center',
      left: 'center',
      width: 60,
      height: 20,
      border: {
        type: 'line'
      },
      label: ' Character Picker ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      keys: true,
      mouse: true,
      tags: true
    });

    // Create character list
    const chars = this.mode === 'all' ? CP437_CHARS : COMMON_DRAWING_CHARS;
    const items = chars.map((char, index) => {
      const hex = (this.mode === 'all' ? index : CP437_CHARS.indexOf(char))
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');
      return `{cyan-fg}0x${hex}{/cyan-fg} ${char}  {gray-fg}${this.getCharName(char)}{/gray-fg}`;
    });

    this.charList = list({
      parent: this.dialog,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-5',
      items,
      keys: true,
      mouse: true,
      vi: true,
      scrollbar: {
        style: {
          bg: 'cyan'
        }
      },
      style: {
        selected: {
          bg: 'cyan',
          fg: 'black'
        },
        item: {
          fg: 'white'
        }
      },
      tags: true
    });

    // Info line
    box({
      parent: this.dialog,
      bottom: 2,
      left: 1,
      width: '100%-2',
      height: 1,
      content: `{cyan-fg}Mode:{/} ${this.mode === 'all' ? 'All CP437' : 'Common Drawing'} {gray-fg}|{/} {cyan-fg}Enter{/} Select {cyan-fg}ESC{/} Cancel {cyan-fg}Tab{/} Toggle Mode`,
      tags: true,
      style: {
        fg: 'white'
      }
    });

    // Key bindings
    this.setupKeyBindings();

    // Focus list
    this.charList.focus();
  }

  /**
   * Setup key bindings
   */
  private setupKeyBindings(): void {
    // Select character
    this.charList.key(['enter'], () => {
      const index = this.charList.selected as number;
      const chars = this.mode === 'all' ? CP437_CHARS : COMMON_DRAWING_CHARS;
      const selectedChar = chars[index];

      if (selectedChar) {
        this.state.setCurrentChar(selectedChar);
        if (this.onSelectCallback) {
          this.onSelectCallback(selectedChar);
        }
        this.close();
      }
    });

    // Cancel
    this.charList.key(['escape', 'q'], () => {
      if (this.onCancelCallback) {
        this.onCancelCallback();
      }
      this.close();
    });

    // Toggle mode
    this.charList.key(['tab'], () => {
      this.toggleMode();
    });
  }

  /**
   * Toggle between all CP437 and common drawing chars
   */
  private toggleMode(): void {
    this.mode = this.mode === 'all' ? 'common' : 'all';

    // Update list
    const chars = this.mode === 'all' ? CP437_CHARS : COMMON_DRAWING_CHARS;
    const items = chars.map((char, index) => {
      const hex = (this.mode === 'all' ? index : CP437_CHARS.indexOf(char))
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');
      return `{cyan-fg}0x${hex}{/cyan-fg} ${char}  {gray-fg}${this.getCharName(char)}{/gray-fg}`;
    });

    this.charList.setItems(items);
    this.charList.select(0);

    // Update label
    const infoBox = this.dialog.children[2] as Box;
    if (infoBox) {
      infoBox.setContent(
        `{cyan-fg}Mode:{/} ${this.mode === 'all' ? 'All CP437' : 'Common Drawing'} {gray-fg}|{/} {cyan-fg}Enter{/} Select {cyan-fg}ESC{/} Cancel {cyan-fg}Tab{/} Toggle Mode`
      );
    }

    this.dialog.screen.render();
  }

  /**
   * Get descriptive name for character
   */
  private getCharName(char: string): string {
    const names: Record<string, string> = {
      '│': 'Vertical Line',
      '─': 'Horizontal Line',
      '┌': 'Top Left Corner',
      '┐': 'Top Right Corner',
      '└': 'Bottom Left Corner',
      '┘': 'Bottom Right Corner',
      '├': 'Left T',
      '┤': 'Right T',
      '┬': 'Top T',
      '┴': 'Bottom T',
      '┼': 'Cross',
      '║': 'Double Vertical',
      '═': 'Double Horizontal',
      '╔': 'Double Top Left',
      '╗': 'Double Top Right',
      '╚': 'Double Bottom Left',
      '╝': 'Double Bottom Right',
      '█': 'Full Block',
      '▄': 'Lower Half Block',
      '▌': 'Left Half Block',
      '▐': 'Right Half Block',
      '▀': 'Upper Half Block',
      '▓': 'Dark Shade',
      '▒': 'Medium Shade',
      '░': 'Light Shade',
      '☺': 'Smiley Face',
      '☻': 'Smiley Face Filled',
      '♥': 'Heart',
      '♦': 'Diamond',
      '♣': 'Club',
      '♠': 'Spade'
    };

    return names[char] || '';
  }

  /**
   * Show dialog
   */
  show(): void {
    this.dialog.show();
    this.charList.focus();
    this.dialog.screen.render();
  }

  /**
   * Close dialog
   */
  close(): void {
    this.dialog.destroy();
  }
}

/**
 * Color picker for foreground/background colors
 */
export interface ColorPickerOptions {
  parent: Screen;
  state: EditorState;
  mode: 'fg' | 'bg';
  iceColors?: boolean;
  onSelect?: (color: number) => void;
  onCancel?: () => void;
}

/**
 * Color names (0-15)
 */
const COLOR_NAMES = [
  'Black', 'Red', 'Green', 'Yellow',
  'Blue', 'Magenta', 'Cyan', 'White',
  'Bright Black', 'Bright Red', 'Bright Green', 'Bright Yellow',
  'Bright Blue', 'Bright Magenta', 'Bright Cyan', 'Bright White'
];

/**
 * Color picker dialog
 */
export class ColorPicker {
  private dialog: Box;
  private colorList: List;
  private state: EditorState;
  private mode: 'fg' | 'bg';
  private iceColors: boolean;
  private onSelectCallback?: (color: number) => void;
  private onCancelCallback?: () => void;

  constructor(options: ColorPickerOptions) {
    this.state = options.state;
    this.mode = options.mode;
    this.iceColors = options.iceColors || false;
    this.onSelectCallback = options.onSelect;
    this.onCancelCallback = options.onCancel;

    // Create dialog box
    this.dialog = box({
      parent: options.parent,
      top: 'center',
      left: 'center',
      width: 40,
      height: this.iceColors ? 20 : 12,
      border: {
        type: 'line'
      },
      label: ` ${this.mode === 'fg' ? 'Foreground' : 'Background'} Color `,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      keys: true,
      mouse: true,
      tags: true
    });

    // Create color list
    const maxColors = this.iceColors ? 16 : 8;
    const items = [];
    for (let i = 0; i < maxColors; i++) {
      const colorName = this.getColorName(i);
      const sample = this.getColorSample(i);
      items.push(`{cyan-fg}${i.toString().padStart(2, ' ')}{/cyan-fg} ${sample} ${colorName}`);
    }

    this.colorList = list({
      parent: this.dialog,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-4',
      items,
      keys: true,
      mouse: true,
      vi: true,
      style: {
        selected: {
          bg: 'cyan',
          fg: 'black'
        },
        item: {
          fg: 'white'
        }
      },
      tags: true
    });

    // Info line
    box({
      parent: this.dialog,
      bottom: 1,
      left: 1,
      width: '100%-2',
      height: 1,
      content: '{cyan-fg}Enter{/} Select {cyan-fg}ESC{/} Cancel',
      tags: true,
      style: {
        fg: 'white'
      }
    });

    // Key bindings
    this.setupKeyBindings();

    // Select current color
    const currentColor = this.mode === 'fg' ? this.state.getCurrentFg() : this.state.getCurrentBg();
    this.colorList.select(currentColor);

    // Focus list
    this.colorList.focus();
  }

  /**
   * Setup key bindings
   */
  private setupKeyBindings(): void {
    // Select color
    this.colorList.key(['enter'], () => {
      const color = this.colorList.selected as number;

      if (this.mode === 'fg') {
        this.state.setCurrentFg(color);
      } else {
        this.state.setCurrentBg(color);
      }

      if (this.onSelectCallback) {
        this.onSelectCallback(color);
      }

      this.close();
    });

    // Cancel
    this.colorList.key(['escape', 'q'], () => {
      if (this.onCancelCallback) {
        this.onCancelCallback();
      }
      this.close();
    });
  }

  /**
   * Get color name
   */
  private getColorName(code: number): string {
    const colors = [
      'black', 'red', 'green', 'yellow',
      'blue', 'magenta', 'cyan', 'white',
      'lightblack', 'lightred', 'lightgreen', 'lightyellow',
      'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite'
    ];
    return colors[code] || 'white';
  }

  /**
   * Get color sample for display
   */
  private getColorSample(color: number): string {
    const colorName = this.getColorName(color);
    return `{${colorName}-bg}    {/${colorName}-bg}`;
  }

  /**
   * Show dialog
   */
  show(): void {
    this.dialog.show();
    this.colorList.focus();
    this.dialog.screen.render();
  }

  /**
   * Close dialog
   */
  close(): void {
    this.dialog.destroy();
  }
}

/**
 * Get CP437 character by code (0-255)
 */
export function getCP437Char(code: number): string {
  return CP437_CHARS[code] || ' ';
}

/**
 * Get CP437 code for character
 */
export function getCP437Code(char: string): number {
  return CP437_CHARS.indexOf(char);
}

/**
 * Check if character is in CP437 set
 */
export function isCP437Char(char: string): boolean {
  return CP437_CHARS.includes(char);
}

/**
 * Get all CP437 characters
 */
export function getAllCP437Chars(): string[] {
  return [...CP437_CHARS];
}

/**
 * Get common drawing characters
 */
export function getCommonDrawingChars(): string[] {
  return [...COMMON_DRAWING_CHARS];
}
