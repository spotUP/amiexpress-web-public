/**
 * ANSI Color Picker Dialog (Neo-Blessed Enhanced)
 * Modal dialog for selecting foreground and background colors
 */

import { box, text, type Screen, type Box, type Text } from '../../blessed';

export interface ColorPickerOptions {
  parent: Screen;
  onColorSelect?: (ansiCode: string) => void;
  onClose?: () => void;
}

export type ANSIColorName =
  | 'black' | 'red' | 'green' | 'yellow'
  | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'gray' | 'bright-red' | 'bright-green' | 'bright-yellow'
  | 'bright-blue' | 'bright-magenta' | 'bright-cyan' | 'bright-white';

export interface ANSIColorInfo {
  name: ANSIColorName;
  displayName: string;
  fgCode: number;  // Foreground ANSI code
  bgCode: number;  // Background ANSI code
  blessed: string; // Blessed color name
}

/**
 * ANSI Color Picker Dialog (Neo-Blessed Enhanced)
 */
export class ColorPicker {
  private box: Box;
  private colorBoxes: Box[] = [];
  private selectedIndex: number = 0;
  private mode: 'fg' | 'bg' = 'fg';
  private options: ColorPickerOptions;

  // 16 standard ANSI colors
  private static readonly COLORS: ANSIColorInfo[] = [
    { name: 'black', displayName: 'Black', fgCode: 30, bgCode: 40, blessed: 'black' },
    { name: 'red', displayName: 'Red', fgCode: 31, bgCode: 41, blessed: 'red' },
    { name: 'green', displayName: 'Green', fgCode: 32, bgCode: 42, blessed: 'green' },
    { name: 'yellow', displayName: 'Yellow', fgCode: 33, bgCode: 43, blessed: 'yellow' },
    { name: 'blue', displayName: 'Blue', fgCode: 34, bgCode: 44, blessed: 'blue' },
    { name: 'magenta', displayName: 'Magenta', fgCode: 35, bgCode: 45, blessed: 'magenta' },
    { name: 'cyan', displayName: 'Cyan', fgCode: 36, bgCode: 46, blessed: 'cyan' },
    { name: 'white', displayName: 'White', fgCode: 37, bgCode: 47, blessed: 'white' },
    { name: 'gray', displayName: 'Gray', fgCode: 90, bgCode: 100, blessed: 'gray' },
    { name: 'bright-red', displayName: 'Bright Red', fgCode: 91, bgCode: 101, blessed: 'red' },
    { name: 'bright-green', displayName: 'Bright Green', fgCode: 92, bgCode: 102, blessed: 'green' },
    { name: 'bright-yellow', displayName: 'Bright Yellow', fgCode: 93, bgCode: 103, blessed: 'yellow' },
    { name: 'bright-blue', displayName: 'Bright Blue', fgCode: 94, bgCode: 104, blessed: 'blue' },
    { name: 'bright-magenta', displayName: 'Bright Magenta', fgCode: 95, bgCode: 105, blessed: 'magenta' },
    { name: 'bright-cyan', displayName: 'Bright Cyan', fgCode: 96, bgCode: 106, blessed: 'cyan' },
    { name: 'bright-white', displayName: 'Bright White', fgCode: 97, bgCode: 107, blessed: 'white' },
  ];

  constructor(options: ColorPickerOptions) {
    this.options = options;

    // Create dialog box with mouse support
    this.box = box({
      parent: options.parent,
      top: 'center',
      left: 'center',
      width: 52,
      height: 18,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan',
        },
      },
      tags: true,
      label: ' {cyan-fg}ANSI Color Picker{/} ',
      keys: true,
      mouse: true,
    });

    // Title
    text({
      parent: this.box,
      top: 0,
      left: 2,
      content: '{yellow-fg}Select Color{/}  {gray-fg}[Arrow Keys]{/} {white-fg}Navigate{/}  {gray-fg}[Enter]{/} {white-fg}Select{/}  {gray-fg}[Tab]{/} {white-fg}FG/BG{/}',
      tags: true,
    });

    // Mode indicator
    const modeIndicator = text({
      parent: this.box,
      top: 1,
      left: 2,
      content: '',
      tags: true,
    });

    const updateModeIndicator = () => {
      modeIndicator.setContent(
        this.mode === 'fg'
          ? '{green-fg}Mode:{/} Foreground'
          : '{green-fg}Mode:{/} Background'
      );
    };

    updateModeIndicator();

    // Create color grid (4 rows x 4 cols) with mouse support
    let colorIndex = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (colorIndex >= ColorPicker.COLORS.length) break;

        const color = ColorPicker.COLORS[colorIndex];
        const boxLeft = 2 + (col * 12);
        const boxTop = 3 + (row * 3);
        const index = colorIndex;

        // Color preview box with mouse support
        const colorBox = box({
          parent: this.box,
          top: boxTop,
          left: boxLeft,
          width: 10,
          height: 2,
          style: {
            fg: color.blessed === 'black' ? 'white' : 'black',
            bg: color.blessed,
          },
          content: `{center}${color.displayName}{/center}`,
          tags: true,
          border: {
            type: 'line',
          },
          mouse: true,
          clickable: true,
        });

        // Handle mouse click on color box
        colorBox.on('click', () => {
          this.selectedIndex = index;
          this.selectColor();
        });

        this.colorBoxes.push(colorBox);
        colorIndex++;
      }
    }

    // Help text
    text({
      parent: this.box,
      top: 15,
      left: 2,
      content: '{gray-fg}ESC{/}: Cancel  {gray-fg}Tab{/}: Toggle FG/BG  {gray-fg}Enter{/}: Insert  {gray-fg}Click{/}: Select',
      tags: true,
      style: {
        fg: 'yellow',
      },
    });

    this.setupKeyHandlers(modeIndicator, updateModeIndicator);
    this.updateSelection();
  }

  /**
   * Setup keyboard handlers
   */
  private setupKeyHandlers(
    modeIndicator: Text,
    updateModeIndicator: () => void
  ): void {
    this.box.key(['escape'], () => {
      this.close();
    });

    this.box.key(['enter'], () => {
      this.selectColor();
    });

    this.box.key(['tab'], () => {
      this.mode = this.mode === 'fg' ? 'bg' : 'fg';
      updateModeIndicator();
      this.options.parent.render();
    });

    this.box.key(['left'], () => {
      if (this.selectedIndex % 4 > 0) {
        this.selectedIndex--;
        this.updateSelection();
        this.options.parent.render();
      }
    });

    this.box.key(['right'], () => {
      if (this.selectedIndex % 4 < 3 && this.selectedIndex < ColorPicker.COLORS.length - 1) {
        this.selectedIndex++;
        this.updateSelection();
        this.options.parent.render();
      }
    });

    this.box.key(['up'], () => {
      if (this.selectedIndex >= 4) {
        this.selectedIndex -= 4;
        this.updateSelection();
        this.options.parent.render();
      }
    });

    this.box.key(['down'], () => {
      if (this.selectedIndex + 4 < ColorPicker.COLORS.length) {
        this.selectedIndex += 4;
        this.updateSelection();
        this.options.parent.render();
      }
    });
  }

  /**
   * Update selection highlight
   */
  private updateSelection(): void {
    // Update all box borders to show selection
    this.colorBoxes.forEach((box, index) => {
      const color = ColorPicker.COLORS[index];
      (box as any).style.border = {
        fg: index === this.selectedIndex ? 'yellow' : color.blessed,
      };
    });
  }

  /**
   * Select current color
   */
  private selectColor(): void {
    const color = ColorPicker.COLORS[this.selectedIndex];
    const code = this.mode === 'fg' ? color.fgCode : color.bgCode;
    const ansiCode = `\x1b[${code}m`;

    if (this.options.onColorSelect) {
      this.options.onColorSelect(ansiCode);
    }

    this.close();
  }

  /**
   * Show dialog
   */
  show(): void {
    this.box.show();
    this.box.focus();
    this.options.parent.render();
  }

  /**
   * Close dialog
   */
  close(): void {
    this.box.destroy();
    if (this.options.onClose) {
      this.options.onClose();
    }
    this.options.parent.render();
  }

  /**
   * Get ANSI code for a color
   */
  static getANSICode(colorName: ANSIColorName, mode: 'fg' | 'bg'): string {
    const color = ColorPicker.COLORS.find(c => c.name === colorName);
    if (!color) {
      return '';
    }
    const code = mode === 'fg' ? color.fgCode : color.bgCode;
    return `\x1b[${code}m`;
  }

  /**
   * Get color reset code
   */
  static getResetCode(): string {
    return '\x1b[0m';
  }
}
