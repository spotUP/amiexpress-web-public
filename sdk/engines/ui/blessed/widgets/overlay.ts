/**
 * Overlay - Semi-transparent overlay widget
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface OverlayOptions extends ElementOptions {
  opacity?: number;
}

export class Overlay extends Box {
  private opacity: number;

  constructor(options: OverlayOptions = {}) {
    super({
      ...options,
      top: options.top || 0,
      left: options.left || 0,
      width: options.width || '100%',
      height: options.height || '100%',
      style: {
        bg: 'black',
        ...(options.style || {}),
      },
    });

    this.opacity = options.opacity !== undefined ? options.opacity : 0.5;
  }

  /**
   * Set overlay opacity (0-1)
   */
  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get overlay opacity
   */
  getOpacity(): number {
    return this.opacity;
  }

  /**
   * Show overlay with fade in effect
   */
  fadeIn(duration: number = 300, callback?: () => void): void {
    const steps = 20;
    const stepDuration = duration / steps;
    const opacityStep = this.opacity / steps;

    let currentOpacity = 0;
    const interval = setInterval(() => {
      currentOpacity += opacityStep;
      if (currentOpacity >= this.opacity) {
        currentOpacity = this.opacity;
        clearInterval(interval);
        if (callback) callback();
      }
      if (this.screen) {
        this.screen.render();
      }
    }, stepDuration);

    this.show();
  }

  /**
   * Hide overlay with fade out effect
   */
  fadeOut(duration: number = 300, callback?: () => void): void {
    const steps = 20;
    const stepDuration = duration / steps;
    const opacityStep = this.opacity / steps;

    let currentOpacity = this.opacity;
    const interval = setInterval(() => {
      currentOpacity -= opacityStep;
      if (currentOpacity <= 0) {
        currentOpacity = 0;
        clearInterval(interval);
        this.hide();
        if (callback) callback();
      }
      if (this.screen) {
        this.screen.render();
      }
    }, stepDuration);
  }
}
