/**
 * Picture Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/picture.js
 * Displays images as ASCII art
 *
 * Responsive features:
 * - Auto-rescales placeholder on resize
 *
 * Note: Original depends on 'picture-tuber' npm package for image rendering.
 * This implementation provides the API but displays placeholder text.
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface PictureOptions extends ElementOptions {
  file?: string;
  base64?: string;
  cols?: number;
  onReady?: () => void;
}

/**
 * Picture Widget
 * Displays images as ASCII art in the terminal
 */
export class Picture extends Box {
  declare options: PictureOptions;
  private imageContent = '';

  constructor(options: PictureOptions = {}) {
    options.cols = options.cols || 50;
    super(options);

    if (options.file || options.base64) {
      this.setImage(options);
    }
  }

  setImage(options: PictureOptions): void {
    // Note: picture-tuber integration would go here
    // For now, create a placeholder
    const cols = options.cols || 50;
    const rows = 10;

    const placeholder: string[] = [];
    placeholder.push('┌' + '─'.repeat(cols - 2) + '┐');
    for (let i = 0; i < rows - 2; i++) {
      if (i === Math.floor(rows / 2) - 1) {
        const text = '[Picture Widget - Image Rendering]';
        const padding = Math.floor((cols - text.length - 2) / 2);
        placeholder.push('│' + ' '.repeat(padding) + text + ' '.repeat(cols - text.length - padding - 2) + '│');
      } else if (i === Math.floor(rows / 2)) {
        const text = options.file ? `File: ${options.file}` : 'Base64 Image';
        const padding = Math.floor((cols - text.length - 2) / 2);
        placeholder.push('│' + ' '.repeat(padding) + text + ' '.repeat(cols - text.length - padding - 2) + '│');
      } else {
        placeholder.push('│' + ' '.repeat(cols - 2) + '│');
      }
    }
    placeholder.push('└' + '─'.repeat(cols - 2) + '┘');

    this.imageContent = placeholder.join('\n');

    // Call onReady callback
    if (options.onReady) {
      setTimeout(options.onReady, 0);
    }
  }

  render(): any {
    this.setContent(this.imageContent);
    return super.render();
  }

  getOptionsPrototype(): PictureOptions {
    return {
      base64: 'AAAA',
      cols: 1
    };
  }

  get type(): string {
    return 'picture';
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
    // Re-render image with new dimensions
    if (this.options.file || this.options.base64) {
      this.setImage(this.options);
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function picture(options: PictureOptions = {}): Picture {
  return new Picture(options);
}
