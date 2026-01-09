/**
 * Image - Browser-compatible image display widget
 * Note: Uses data URLs or external image sources
 *
 * Responsive features:
 * - Auto-scales placeholder on resize
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface ImageOptions extends ElementOptions {
  src?: string;
  file?: string;
  type?: 'overlay' | 'ansi';
  scale?: number;
  autoPlay?: boolean;
}

export class Image extends Box {
  private src: string = '';
  private imageType: 'overlay' | 'ansi';
  private scale: number;
  private autoPlay: boolean;
  private imageData: string = '';

  constructor(options: ImageOptions = {}) {
    const { src, file, type, scale, autoPlay, ...boxOptions } = options;

    super({
      ...boxOptions,
      width: options.width || 'shrink',
      height: options.height || 'shrink',
    });

    this.imageType = type || 'overlay';
    this.scale = scale || 1.0;
    this.autoPlay = autoPlay !== false;

    if (src) {
      this.setImage(src);
    } else if (file) {
      this.setImage(file);
    }
  }

  /**
   * Set image source (URL or data URL)
   */
  setImage(src: string): void {
    this.src = src;
    this.emit('load', src);

    // For browser compatibility, we display ASCII representation
    // Real image rendering would require canvas integration
    const placeholder = this.generatePlaceholder();
    this.setContent(placeholder);

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Generate ASCII placeholder for image
   */
  private generatePlaceholder(): string {
    const w = typeof this.width === 'number' ? this.width : 40;
    const h = typeof this.height === 'number' ? this.height : 10;

    const lines: string[] = [];
    lines.push('┌' + '─'.repeat(w - 2) + '┐');

    for (let i = 0; i < h - 4; i++) {
      lines.push('│' + ' '.repeat(w - 2) + '│');
    }

    // Add image info in center
    const info = `[Image: ${this.src.substring(0, w - 10)}]`;
    const padding = Math.floor((w - info.length) / 2);
    lines.push('│' + ' '.repeat(padding) + info + ' '.repeat(w - 2 - padding - info.length) + '│');

    lines.push('└' + '─'.repeat(w - 2) + '┘');

    return lines.join('\n');
  }

  /**
   * Load image from data URL
   */
  loadImage(dataUrl: string): void {
    this.imageData = dataUrl;
    this.setImage(dataUrl);
  }

  /**
   * Clear image
   */
  clearImage(): void {
    this.src = '';
    this.imageData = '';
    this.setContent('');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get image source
   */
  getImage(): string {
    return this.src;
  }

  /**
   * Set image scale
   */
  setScale(scale: number): void {
    this.scale = Math.max(0.1, Math.min(10.0, scale));
    this.setImage(this.src);
  }

  /**
   * Get image scale
   */
  getScale(): number {
    return this.scale;
  }

  /**
   * Play animation (for animated images)
   */
  play(): void {
    this.autoPlay = true;
    this.emit('play');
  }

  /**
   * Pause animation
   */
  pause(): void {
    this.autoPlay = false;
    this.emit('pause');
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.autoPlay;
  }

  /**
   * Get image dimensions (placeholder)
   */
  getImageSize(): { width: number; height: number } {
    return {
      width: typeof this.width === 'number' ? this.width : 0,
      height: typeof this.height === 'number' ? this.height : 0,
    };
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
    // Regenerate placeholder with new dimensions
    if (this.src) {
      const placeholder = this.generatePlaceholder();
      this.setContent(placeholder);
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
