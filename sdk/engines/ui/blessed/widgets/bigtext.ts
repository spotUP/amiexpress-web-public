/**
 * BigText - Large ASCII text widget using figlet-style fonts
 *
 * Responsive features:
 * - Switches to simpler font on mobile
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface BigTextOptions extends ElementOptions {
  text?: string;
  font?: 'standard' | 'banner' | 'block' | 'simple';
  fch?: string; // Fill character
}

export class BigText extends Box {
  private text: string = '';
  private font: 'standard' | 'banner' | 'block' | 'simple';
  private fch: string;
  private _desktopFont: 'standard' | 'banner' | 'block' | 'simple' | undefined;
  private _isMobileMode: boolean = false;

  constructor(options: BigTextOptions = {}) {
    super({
      ...options,
      width: options.width || 'shrink',
      height: options.height || 'shrink',
    });

    this.text = options.text || '';
    this.font = options.font || 'standard';
    this.fch = options.fch || '#';

    this.updateContent();
  }

  /**
   * Generate big text from input string
   */
  private generateBigText(): string {
    switch (this.font) {
      case 'banner':
        return this.generateBanner();
      case 'block':
        return this.generateBlock();
      case 'simple':
        return this.generateSimple();
      default:
        return this.generateStandard();
    }
  }

  /**
   * Generate standard 5-line ASCII art
   */
  private generateStandard(): string {
    const patterns: Record<string, string[]> = {
      A: [
        '  ###  ',
        ' #   # ',
        '#     #',
        '#######',
        '#     #',
      ],
      B: [
        '######',
        '#     #',
        '######',
        '#     #',
        '######',
      ],
      C: [
        ' ##### ',
        '#     #',
        '#      ',
        '#     #',
        ' ##### ',
      ],
      // Add more letters as needed...
      ' ': [
        '   ',
        '   ',
        '   ',
        '   ',
        '   ',
      ],
    };

    const lines: string[] = ['', '', '', '', ''];
    const chars = this.text.toUpperCase().split('');

    for (const char of chars) {
      const pattern = patterns[char] || patterns[' '];
      for (let i = 0; i < 5; i++) {
        lines[i] += pattern[i] + ' ';
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate banner style (3-line)
   */
  private generateBanner(): string {
    const patterns: Record<string, string[]> = {
      A: [
        ' ### ',
        '# # #',
        '#####',
      ],
      B: [
        '#### ',
        '#### ',
        '#### ',
      ],
      // Simplified patterns
      ' ': [
        '  ',
        '  ',
        '  ',
      ],
    };

    const lines: string[] = ['', '', ''];
    const chars = this.text.toUpperCase().split('');

    for (const char of chars) {
      const pattern = patterns[char] || patterns[' '];
      for (let i = 0; i < 3; i++) {
        lines[i] += pattern[i] + ' ';
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate block style (filled rectangles)
   */
  private generateBlock(): string {
    const width = 5;
    const height = 5;
    const ch = this.fch;

    const lines: string[] = [];
    for (let i = 0; i < height; i++) {
      let line = '';
      for (const char of this.text) {
        line += ch.repeat(width) + ' ';
      }
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Generate simple double-height text
   */
  private generateSimple(): string {
    const topLine = this.text.split('').map(c => c + ' ').join('');
    const bottomLine = topLine;
    return topLine + '\n' + bottomLine;
  }

  /**
   * Update content with generated big text
   */
  private updateContent(): void {
    const bigText = this.generateBigText();
    this.setContent(bigText);
  }

  /**
   * Set text content
   */
  setText(text: string): void {
    this.text = text;
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get text content
   */
  getText(): string {
    return this.text;
  }

  /**
   * Set font style
   */
  setFont(font: 'standard' | 'banner' | 'block' | 'simple'): void {
    this.font = font;
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Set fill character
   */
  setFillChar(ch: string): void {
    this.fch = ch;
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);

    if (state.isMobile && !this._isMobileMode) {
      this._enterMobileMode();
    } else if (!state.isMobile && this._isMobileMode) {
      this._exitMobileMode();
    }

    this.updateContent();
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  protected _enterMobileMode(): void {
    this._isMobileMode = true;
    // Save desktop font and switch to simpler font for mobile
    this._desktopFont = this.font;
    if (this.font === 'standard' || this.font === 'block') {
      this.font = 'simple';
    }
  }

  protected _exitMobileMode(): void {
    this._isMobileMode = false;
    // Restore desktop font
    if (this._desktopFont) {
      this.font = this._desktopFont;
      this._desktopFont = undefined;
    }
  }
}
