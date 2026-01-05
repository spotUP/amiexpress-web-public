/**
 * ColorPicker Widget
 * Visual grid for selecting ANSI colors
 */

import { Box } from './box';
import { Button } from './button';
import type { ColorPickerOptions } from '../core/types';

export class ColorPicker extends Box {
  private selectedColor: string = 'white';
  private colorButtons: Button[] = [];
  
  private static readonly ANSI_COLORS = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'light-black', 'light-red', 'light-green', 'light-yellow', 'light-blue', 'light-magenta', 'light-cyan', 'light-white'
  ];

  constructor(options: ColorPickerOptions = {}) {
    super({
      width: 20,
      height: 6,
      border: 'line',
      label: ' Color ',
      ...options,
    });

    this.selectedColor = options.color || 'white';

    this.setupGrid();
  }

  private setupGrid(): void {
    const cols = 8;
    const itemWidth = 2;
    const itemHeight = 1;

    ColorPicker.ANSI_COLORS.forEach((color, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const btn = new Button({
        parent: this,
        top: row * itemHeight,
        left: col * itemWidth,
        width: itemWidth,
        height: itemHeight,
        content: '  ',
        style: {
          bg: color,
          focus: {
            bg: 'white',
            fg: 'black'
          }
        },
        border: undefined,
      });

      btn.on('press', () => {
        this.selectColor(color);
      });

      this.colorButtons.push(btn);
    });
  }

  /**
   * Select a color programmatically
   */
  selectColor(color: string): void {
    this.selectedColor = color;
    this.emit('select', color);
    this.screen?.render();
  }

  /**
   * Get the currently selected color
   */
  getSelectedColor(): string {
    return this.selectedColor;
  }

  get type(): string {
    return 'colorpicker';
  }
}

/**
 * Factory function
 */
export function colorpicker(options: ColorPickerOptions): ColorPicker {
  return new ColorPicker(options);
}
