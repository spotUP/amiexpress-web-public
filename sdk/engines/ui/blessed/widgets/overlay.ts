/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

// Use String.fromCharCode(27) for ESC to survive Terser minification
const ESC = String.fromCharCode(27);

export interface OverlayOptions extends ElementOptions {
  opacity?: number;
}

export class Overlay extends Box {
  private _overlayOpacity: number;
  private _overlayWidgetId: string;

  constructor(options: OverlayOptions = {}) {
    // Extract style without bg - Overlay uses no background for ANSI
    // The CSS overlay provides the visual dimming effect for web clients
    const { bg: _ignoredBg, ...styleWithoutBg } = options.style || {};

    super({
      ...options,
      top: options.top || 0,
      left: options.left || 0,
      width: options.width || '100%',
      height: options.height || '100%',
      focusable: true,  // Enable focus for key handling
      keyable: true,    // Enable key events
      clickable: true,  // Enable click events
      style: {
        bg: 'transparent',
        ...styleWithoutBg,
        // CSS overlay provides dimming for web, ANSI clients just see the modal on top
      },
    });

    this._overlayOpacity = options.opacity !== undefined ? options.opacity : 0.5;
    this._overlayWidgetId = `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Enable key handling
    this.enableKeys();

    // Auto-focus when shown - also emit web transparency event and trap focus (optional)
    this.on('show', () => {
      if (this.screen && this.options.trapFocus) {
        (this.screen as any).trapFocus(this);
      }
      this._emitOverlayWidgetEvent(true);
      if (this.screen) {
        this.screen.render();
      }
    });

    // Emit hide event for web transparency and release focus trap
    this.on('hide', () => {
      if (this.screen && this.options.trapFocus) {
        (this.screen as any).releaseFocusTrap();
      }
      this._emitOverlayWidgetEvent(false);
    });

    // Default escape handler to hide overlay
    this.key(['escape'], () => {
      this.hide();
      this.emit('cancel');
      if (this.screen) {
        this.screen.render();
      }
    });

    // Update overlay position on screen resize (for web clients)
    this.on('attach', () => {
      if (this.screen) {
        this.screen.on('resize', () => {
          // Only update if overlay is visible
          if (!this.hidden) {
            this._emitOverlayWidgetEvent(true);
          }
        });
      }
    });
  }

  /**
   * Emit overlay event for web clients to render actual transparency
   */
  private _emitOverlayWidgetEvent(show: boolean): void {
    if (!this.screen) {
      return;
    }

    // Get element position for positioned overlay rendering
    const coords = this._getCoords();
    const pos = coords ? {
      x: coords.xi,
      y: coords.yi,
      width: coords.xl - coords.xi,
      height: coords.yl - coords.yi,
    } : {
      // Default to full screen if coords not available
      x: 0,
      y: 0,
      width: this.screen.width,
      height: this.screen.height,
    };

    // Send a special escape sequence that the frontend can intercept
    // Format: ESC ] 9999 ; overlay ; <json> BEL
    const data = JSON.stringify({
      id: this._overlayWidgetId,
      show,
      opacity: this._overlayOpacity,
      // Position info for positioned overlays (web only)
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
    });
    const osc = ESC + `]9999;overlay;${data}` + String.fromCharCode(7);
    // Use OSC (Operating System Command) format that won't display as text
    // Write directly through the screen's program which handles output
    this.screen.program.write(osc);
  }

  /**
   * Get overlay opacity
   */
  get opacity(): number {
    return this._overlayOpacity;
  }

  /**
   * Set overlay opacity (0-1)
   */
  setOpacity(opacity: number): void {
    this._overlayOpacity = Math.max(0, Math.min(1, opacity));
    if (this.screen && !this.hidden) {
      this._emitOverlayWidgetEvent(true);
      this.screen.render();
    }
  }

  /**
   * Get overlay opacity (legacy method)
   */
  getOpacity(): number {
    return this._overlayOpacity;
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
