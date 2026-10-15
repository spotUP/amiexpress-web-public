/**
 * ANSIImage - ANSI art display widget
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface ANSIImageOptions extends ElementOptions {
  file?: string;
  ansi?: string;
  animate?: boolean;
  animationSpeed?: number;
}

export class ANSIImage extends Box {
  private ansi: string = '';
  private animate: boolean;
  private animationSpeed: number;
  private animationTimer: any = null;
  private animationFrame: number = 0;
  private frames: string[] = [];

  constructor(options: ANSIImageOptions = {}) {
    super({
      ...options,
      width: options.width || 'shrink',
      height: options.height || 'shrink',
      scrollable: options.scrollable !== false,
      tags: false, // Disable tag parsing for ANSI
    });

    this.animate = options.animate || false;
    this.animationSpeed = options.animationSpeed || 100;

    if (options.ansi) {
      this.setANSI(options.ansi);
    }
  }

  /**
   * Set ANSI content
   */
  setANSI(ansi: string): void {
    this.ansi = ansi;

    if (this.animate) {
      // Split into frames (assuming frames are separated by form feed)
      this.frames = ansi.split('\f').filter(f => f.trim());
      if (this.frames.length > 0) {
        this.setContent(this.frames[0]);
        this.startAnimation();
      }
    } else {
      this.setContent(ansi);
    }

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Load ANSI from file (requires file content to be passed)
   */
  loadANSI(content: string): void {
    this.setANSI(content);
  }

  /**
   * Start animation
   */
  startAnimation(): void {
    if (this.animationTimer || this.frames.length <= 1) return;

    this.animationTimer = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % this.frames.length;
      this.setContent(this.frames[this.animationFrame]);
      if (this.screen) {
        this.screen.render();
      }
    }, this.animationSpeed);
  }

  /**
   * Stop animation
   */
  stopAnimation(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  /**
   * Set animation speed (ms per frame)
   */
  setAnimationSpeed(speed: number): void {
    this.animationSpeed = speed;
    if (this.animationTimer) {
      this.stopAnimation();
      this.startAnimation();
    }
  }

  /**
   * Clear ANSI content
   */
  clearImage(): void {
    this.ansi = '';
    this.frames = [];
    this.setContent('');
    this.stopAnimation();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.stopAnimation();
    super.destroy();
  }

  /**
   * Get ANSI content
   */
  getANSI(): string {
    return this.ansi;
  }

  /**
   * Get current frame (for animated ANSI)
   */
  getCurrentFrame(): number {
    return this.animationFrame;
  }

  /**
   * Get total frames (for animated ANSI)
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Set specific frame
   */
  setFrame(frame: number): void {
    if (frame >= 0 && frame < this.frames.length) {
      this.animationFrame = frame;
      this.setContent(this.frames[frame]);
      if (this.screen) {
        this.screen.render();
      }
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
    // ANSI content is fixed-size, just trigger re-render
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
