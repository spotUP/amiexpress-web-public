/**
 * Modal system for ANSI Editor
 */

import { Tool, ModalOption, HIDE_CURSOR } from './types';

// Forward declaration - will be imported properly in index.ts
export interface ANSIEditor {
  // This interface is just for type checking in modals
}

export abstract class Modal {
  protected selectedIndex = 0;
  protected options: ModalOption[] = [];
  protected title = '';
  protected editor: any; // Using 'any' to avoid circular dependency

  constructor(editor: any, title: string, options: ModalOption[]) {
    this.editor = editor;
    this.title = title;
    this.options = options;
  }

  abstract render(): string;

  protected drawBox(x: number, y: number, width: number, height: number, fg: number, bg: number): string {
    let buffer = '';
    // Top border
    buffer += `\x1b[${y};${x}H\x1b[0;3${fg};4${bg}m+${'-'.repeat(width - 2)}+`;
    // Sides and fill interior with background color
    for (let i = 1; i < height - 1; i++) {
      buffer += `\x1b[${y + i};${x}H\x1b[0;3${fg};4${bg}m|`;
      buffer += ' '.repeat(width - 2);  // Fill with spaces (background color)
      buffer += '|';
    }
    // Bottom border
    buffer += `\x1b[${y + height - 1};${x}H\x1b[0;3${fg};4${bg}m+${'-'.repeat(width - 2)}+`;
    return buffer;
  }

  protected centerText(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text + ' '.repeat(width - padding - text.length);
  }

  moveUp(): void {
    this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
  }

  moveDown(): void {
    this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
  }

  getSelectedValue(): string {
    return this.options[this.selectedIndex].value;
  }
}

export class ToolSelectorModal extends Modal {
  constructor(editor: any, currentTool: Tool) {
    const options: ModalOption[] = [
      { value: 'draw', label: 'Draw', description: 'Freehand drawing', icon: '*' },
      { value: 'line', label: 'Line', description: 'Draw straight lines', icon: '/' },
      { value: 'box', label: 'Box', description: 'Draw rectangles', icon: '#' },
      { value: 'ellipse', label: 'Ellipse', description: 'Draw ellipse outline', icon: 'O' },
      { value: 'ellipse-fill', label: 'Ellipse Fill', description: 'Draw filled ellipse', icon: '0' },
      { value: 'shifter', label: 'Shifter', description: 'Shift half-blocks left/right', icon: '<' },
      { value: 'text', label: 'Text', description: 'Type text mode', icon: 'T' },
      { value: 'fill', label: 'Fill', description: 'Flood fill area', icon: '@' },
      { value: 'pick', label: 'Pick', description: 'Pick color/char', icon: '+' }
    ];

    super(editor, 'SELECT TOOL', options);

    // Set selected index to current tool
    this.selectedIndex = options.findIndex(opt => opt.value === currentTool);
    if (this.selectedIndex === -1) this.selectedIndex = 0;
  }

  render(): string {
    let buffer = HIDE_CURSOR;  // Don't clear screen - draw over existing content

    const boxWidth = 50;
    const boxHeight = 14;
    const boxX = Math.floor((80 - boxWidth) / 2) + 1;
    const boxY = Math.floor((24 - boxHeight) / 2) + 1;

    // Draw box with blue background fill
    buffer += this.drawBox(boxX, boxY, boxWidth, boxHeight, 7, 4);

    // Title
    buffer += `\x1b[${boxY + 1};${boxX + 1}H\x1b[0;37;44m`;
    buffer += this.centerText(this.title, boxWidth - 2);

    // Options
    let optY = boxY + 3;
    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const isSelected = i === this.selectedIndex;
      const fg = isSelected ? 0 : 7;
      const bg = isSelected ? 7 : 4;

      buffer += `\x1b[${optY};${boxX + 2}H\x1b[0;3${fg};4${bg}m`;
      const icon = opt.icon || ' ';
      const line = ` ${icon} ${opt.label.padEnd(8)} ${opt.description}`.padEnd(boxWidth - 4);
      buffer += line;
      optY++;
    }

    // Footer
    buffer += `\x1b[${boxY + boxHeight - 2};${boxX + 2}H\x1b[0;37;44m`;
    buffer += this.centerText('ARROWS=Move  ENTER=Select  ESC=Cancel', boxWidth - 4);

    return buffer;
  }
}

export class ColorPickerModal extends Modal {
  private selectedFg = 7;
  private selectedBg = 0;
  private mode: 'fg' | 'bg' = 'fg';
  private iceColorsEnabled = false;  // iCE colors mode (enables bg 8-15)

  constructor(editor: any, currentFg: number, currentBg: number) {
    super(editor, 'SELECT COLORS', []);
    this.selectedFg = currentFg;
    this.selectedBg = currentBg;
  }

  render(): string {
    let buffer = HIDE_CURSOR;  // Don't clear screen - draw over existing content

    const boxWidth = 70;
    const boxHeight = 22;
    const boxX = Math.floor((80 - boxWidth) / 2) + 1;
    const boxY = Math.floor((24 - boxHeight) / 2) + 1;

    // Draw box
    buffer += this.drawBox(boxX, boxY, boxWidth, boxHeight, 7, 4);

    // Title with iCE colors indicator
    buffer += `\x1b[${boxY + 1};${boxX + 1}H\x1b[0;37;44m`;
    const titleText = this.title + (this.iceColorsEnabled ? ' [iCE ENABLED]' : '');
    buffer += this.centerText(titleText, boxWidth - 2);

    // Color names (extended with bright versions)
    const colorNames = [
      'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
      'Gray', 'Bright Red', 'Bright Green', 'Bright Yellow',
      'Bright Blue', 'Bright Magenta', 'Bright Cyan', 'Bright White'
    ];

    // Foreground color selector (all 16 colors)
    buffer += `\x1b[${boxY + 3};${boxX + 2}H\x1b[0;37;44m`;
    buffer += 'Foreground (Ctrl+0-7 toggle bright):';

    let colorY = boxY + 4;
    for (let i = 0; i < 16; i++) {
      const isSelected = this.mode === 'fg' && i === this.selectedFg;

      buffer += `\x1b[${colorY};${boxX + 2}H`;
      if (isSelected) {
        buffer += `\x1b[0;30;47m> `;
      } else {
        buffer += `\x1b[0;37;44m  `;
      }

      // Color block using extended ANSI codes
      const ansiCode = i < 8 ? `3${i}` : `9${i - 8}`;
      buffer += `\x1b[0;${ansiCode}m███ `;

      // Color name
      buffer += `\x1b[0;37;44m${colorNames[i].padEnd(14)}`;

      colorY++;
      if (i === 7) {
        // Extra spacing between normal and bright colors
        buffer += `\x1b[${colorY};${boxX + 2}H\x1b[0;37;44m`;
        colorY++;
      }
    }

    // Background color selector (8 or 16 depending on iCE mode)
    const bgColorCount = this.iceColorsEnabled ? 16 : 8;
    buffer += `\x1b[${boxY + 3};${boxX + 36}H\x1b[0;37;44m`;
    buffer += 'Background (Alt+0-7):';

    colorY = boxY + 4;
    for (let i = 0; i < bgColorCount; i++) {
      const isSelected = this.mode === 'bg' && i === this.selectedBg;

      buffer += `\x1b[${colorY};${boxX + 36}H`;
      if (isSelected) {
        buffer += `\x1b[0;30;47m> `;
      } else {
        buffer += `\x1b[0;37;44m  `;
      }

      // Color block with white foreground
      const ansiCode = i < 8 ? `4${i}` : `10${i - 8}`;
      buffer += `\x1b[0;37;${ansiCode}m███ `;

      // Color name
      buffer += `\x1b[0;37;44m${colorNames[i].padEnd(14)}`;

      colorY++;
      if (i === 7 && this.iceColorsEnabled) {
        // Extra spacing between normal and bright colors
        buffer += `\x1b[${colorY};${boxX + 36}H\x1b[0;37;44m`;
        colorY++;
      }
    }

    // Preview box
    buffer += `\x1b[${boxY + boxHeight - 5};${boxX + 2}H\x1b[0;37;44m`;
    buffer += 'Preview:';

    const previewFg = this.selectedFg < 8 ? `3${this.selectedFg}` : `9${this.selectedFg - 8}`;
    const previewBg = this.selectedBg < 8 ? `4${this.selectedBg}` : `10${this.selectedBg - 8}`;
    buffer += `\x1b[${boxY + boxHeight - 4};${boxX + 2}H`;
    buffer += `\x1b[0;${previewFg};${previewBg}m  Sample Text with These Colors  `;

    // Footer
    buffer += `\x1b[${boxY + boxHeight - 2};${boxX + 2}H\x1b[0;37;44m`;
    buffer += this.centerText('Ctrl+E=iCE  TAB/ARROWS=Nav  ENTER=Apply  ESC=Cancel', boxWidth - 4);

    return buffer;
  }

  moveUp(): void {
    if (this.mode === 'fg') {
      this.selectedFg = (this.selectedFg - 1 + 16) % 16;
    } else {
      const maxBg = this.iceColorsEnabled ? 16 : 8;
      this.selectedBg = (this.selectedBg - 1 + maxBg) % maxBg;
    }
  }

  moveDown(): void {
    if (this.mode === 'fg') {
      this.selectedFg = (this.selectedFg + 1) % 16;
    } else {
      const maxBg = this.iceColorsEnabled ? 16 : 8;
      this.selectedBg = (this.selectedBg + 1) % maxBg;
    }
  }

  moveLeft(): void {
    // Switch to foreground mode
    this.mode = 'fg';
  }

  moveRight(): void {
    // Switch to background mode
    this.mode = 'bg';
  }

  toggleMode(): void {
    this.mode = this.mode === 'fg' ? 'bg' : 'fg';
  }

  toggleIceColors(): void {
    this.iceColorsEnabled = !this.iceColorsEnabled;
    // If disabling iCE colors and bg > 7, clamp to 7
    if (!this.iceColorsEnabled && this.selectedBg > 7) {
      this.selectedBg = 7;
    }
  }

  /**
   * Toggle brightness for a color (0-7 <-> 8-15)
   * Used by Ctrl+0-7 (FG) and Alt+0-7 (BG)
   */
  toggleBrightness(baseColor: number, isFg: boolean): void {
    if (baseColor < 0 || baseColor > 7) return;

    if (isFg) {
      // Toggle FG brightness
      const currentBase = this.selectedFg % 8;
      const isBright = this.selectedFg >= 8;

      if (currentBase === baseColor) {
        // Toggle current color's brightness
        this.selectedFg = isBright ? baseColor : baseColor + 8;
      } else {
        // Set to this base color (not bright)
        this.selectedFg = baseColor;
      }
    } else {
      // Toggle BG brightness (only if iCE colors enabled)
      if (!this.iceColorsEnabled && baseColor + 8 > 7) {
        // Can't set bright backgrounds without iCE colors
        this.selectedBg = baseColor;
        return;
      }

      const currentBase = this.selectedBg % 8;
      const isBright = this.selectedBg >= 8;

      if (currentBase === baseColor) {
        // Toggle current color's brightness
        this.selectedBg = isBright ? baseColor : baseColor + 8;
      } else {
        // Set to this base color (not bright)
        this.selectedBg = baseColor;
      }
    }
  }

  getSelectedFg(): number {
    return this.selectedFg;
  }

  getSelectedBg(): number {
    return this.selectedBg;
  }
}

export class FileDialogModal extends Modal {
  private files: string[] = [];
  private mode: 'save' | 'load';
  private location: 'bbs' | 'local' = 'bbs';

  constructor(editor: any, mode: 'save' | 'load', files: string[]) {
    const menuOptions: ModalOption[] = [
      { value: 'bbs', label: 'BBS Server', description: 'Save/Load from BBS Screens directory' },
      { value: 'local', label: 'Local Computer', description: mode === 'save' ? 'Download ANSI to your computer' : 'Upload ANSI from your computer' }
    ];

    super(editor, mode === 'save' ? 'SAVE FILE' : 'LOAD FILE', menuOptions);
    this.files = files;
    this.mode = mode;
  }

  render(): string {
    let buffer = HIDE_CURSOR;  // Don't clear screen - draw over existing content

    const boxWidth = 66;
    const boxHeight = 20;
    const boxX = Math.floor((80 - boxWidth) / 2) + 1;
    const boxY = Math.floor((24 - boxHeight) / 2) + 1;

    // Draw box
    buffer += this.drawBox(boxX, boxY, boxWidth, boxHeight, 7, 4);

    // Title
    buffer += `\x1b[${boxY + 1};${boxX + 1}H\x1b[0;37;44m`;
    buffer += this.centerText(this.title, boxWidth - 2);

    // Location selector
    buffer += `\x1b[${boxY + 3};${boxX + 2}H\x1b[0;37;44m`;
    buffer += 'Where do you want to ' + (this.mode === 'save' ? 'save' : 'load') + ' the file?';

    // Options
    let optY = boxY + 5;
    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const isSelected = i === this.selectedIndex;
      const fg = isSelected ? 0 : 7;
      const bg = isSelected ? 7 : 4;

      buffer += `\x1b[${optY};${boxX + 4}H\x1b[0;3${fg};4${bg}m`;
      const line = (isSelected ? '> ' : '  ') + opt.label.padEnd(20);
      buffer += line;

      buffer += `\x1b[${optY + 1};${boxX + 4}H\x1b[0;37;44m`;
      buffer += '  ' + opt.description.padEnd(58);

      optY += 3;
    }

    // BBS files list if location is BBS
    if (this.location === 'bbs' && this.files.length > 0) {
      buffer += `\x1b[${boxY + 11};${boxX + 2}H\x1b[0;37;44m`;
      buffer += 'Available BBS Screen Files:';

      // Calculate visible range (scrolling)
      const maxVisible = 5;
      let scrollOffset = 0;

      // File list
      let fileY = boxY + 12;
      for (let i = scrollOffset; i < Math.min(scrollOffset + maxVisible, this.files.length); i++) {
        const file = this.files[i];
        buffer += `\x1b[${fileY};${boxX + 4}H\x1b[0;37;44m`;
        buffer += '- ' + file;
        fileY++;
      }
    }

    // Footer
    buffer += `\x1b[${boxY + boxHeight - 2};${boxX + 2}H\x1b[0;37;44m`;
    buffer += this.centerText('ARROWS=Select  ENTER=Continue  ESC=Cancel', boxWidth - 4);

    return buffer;
  }

  getSelectedLocation(): 'bbs' | 'local' {
    return this.options[this.selectedIndex].value as 'bbs' | 'local';
  }

  setLocation(location: 'bbs' | 'local'): void {
    this.location = location;
  }

  getBBSFiles(): string[] {
    return this.files;
  }
}

export class GalleryBrowserModal extends Modal {
  private files: string[] = [];
  private scrollOffset = 0;

  constructor(editor: any, files: string[]) {
    const options: ModalOption[] = files.map(f => ({
      value: f,
      label: f.replace(/\.txt$/i, ''),
      description: ''
    }));

    super(editor, 'BBS SCREENS GALLERY', options);
    this.files = files;
  }

  render(): string {
    let buffer = HIDE_CURSOR;

    const boxWidth = 70;
    const boxHeight = 20;
    const boxX = Math.floor((80 - boxWidth) / 2) + 1;
    const boxY = Math.floor((24 - boxHeight) / 2) + 1;

    // Draw box
    buffer += this.drawBox(boxX, boxY, boxWidth, boxHeight, 7, 4);

    // Title
    buffer += `\x1b[${boxY + 1};${boxX + 1}H\x1b[0;37;44m`;
    buffer += this.centerText(this.title + ' (SYSOP)', boxWidth - 2);

    // File list with selection
    const maxVisible = 13;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.options.length - maxVisible));

    let fileY = boxY + 3;
    for (let i = this.scrollOffset; i < Math.min(this.scrollOffset + maxVisible, this.options.length); i++) {
      const file = this.options[i];
      const isSelected = i === this.selectedIndex;
      const fg = isSelected ? 0 : 7;
      const bg = isSelected ? 7 : 4;

      buffer += `\x1b[${fileY};${boxX + 2}H\x1b[0;3${fg};4${bg}m`;
      const line = (isSelected ? '> ' : '  ') + file.label.padEnd(boxWidth - 6);
      buffer += line.substring(0, boxWidth - 4);
      fileY++;
    }

    // Scroll indicators
    if (this.scrollOffset > 0) {
      buffer += `\x1b[${boxY + 3};${boxX + boxWidth - 3}H\x1b[0;37;44m^`;
    }
    if (this.scrollOffset + maxVisible < this.options.length) {
      buffer += `\x1b[${boxY + 16};${boxX + boxWidth - 3}H\x1b[0;37;44mv`;
    }

    // Footer
    buffer += `\x1b[${boxY + boxHeight - 2};${boxX + 2}H\x1b[0;37;44m`;
    buffer += this.centerText('ARROWS=Navigate  ENTER=Load  ESC=Cancel', boxWidth - 4);

    return buffer;
  }

  moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      const maxVisible = 13;
      if (this.selectedIndex < this.scrollOffset) {
        this.scrollOffset = this.selectedIndex;
      }
    }
  }

  moveDown(): void {
    if (this.selectedIndex < this.options.length - 1) {
      this.selectedIndex++;
      const maxVisible = 13;
      if (this.selectedIndex >= this.scrollOffset + maxVisible) {
        this.scrollOffset = this.selectedIndex - maxVisible + 1;
      }
    }
  }
}

export class RecentFilesModal extends Modal {
  private recentFiles: string[];

  constructor(editor: any, recentFiles: string[]) {
    const options: ModalOption[] = recentFiles.map(f => ({
      value: f,
      label: f.replace(/\.txt$/i, ''),
      description: ''
    }));

    super(editor, 'RECENT FILES', options);
    this.recentFiles = recentFiles;
  }

  render(): string {
    let buffer = HIDE_CURSOR;

    const boxWidth = 60;
    const boxHeight = 16;
    const boxX = Math.floor((80 - boxWidth) / 2) + 1;
    const boxY = Math.floor((24 - boxHeight) / 2) + 1;

    // Draw box
    buffer += this.drawBox(boxX, boxY, boxWidth, boxHeight, 7, 4);

    // Title
    buffer += `\x1b[${boxY + 1};${boxX + 1}H\x1b[0;37;44m`;
    buffer += this.centerText(this.title + ' (SYSOP)', boxWidth - 2);

    // File list with selection
    let fileY = boxY + 3;
    for (let i = 0; i < Math.min(10, this.options.length); i++) {
      const file = this.options[i];
      const isSelected = i === this.selectedIndex;
      const fg = isSelected ? 0 : 7;
      const bg = isSelected ? 7 : 4;

      buffer += `\x1b[${fileY};${boxX + 2}H\x1b[0;3${fg};4${bg}m`;
      const line = (isSelected ? '> ' : '  ') + `${i + 1}. ${file.label}`.padEnd(boxWidth - 6);
      buffer += line.substring(0, boxWidth - 4);
      fileY++;
    }

    // Empty state
    if (this.options.length === 0) {
      buffer += `\x1b[${boxY + 7};${boxX + 2}H\x1b[0;37;44m`;
      buffer += this.centerText('No recent files', boxWidth - 4);
    }

    // Footer
    buffer += `\x1b[${boxY + boxHeight - 2};${boxX + 2}H\x1b[0;37;44m`;
    buffer += this.centerText('ARROWS=Navigate  ENTER=Load  ESC=Cancel', boxWidth - 4);

    return buffer;
  }
}
