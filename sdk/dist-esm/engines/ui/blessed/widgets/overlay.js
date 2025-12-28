/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 */
import { Box } from './box';
export class Overlay extends Box {
    constructor(options = {}) {
        // Extract style without bg - Overlay always uses transparent ANSI bg
        // The CSS overlay provides the visual dimming effect
        const { bg: _ignoredBg, ...styleWithoutBg } = options.style || {};
        super({
            ...options,
            top: options.top || 0,
            left: options.left || 0,
            width: options.width || '100%',
            height: options.height || '100%',
            focusable: true, // Enable focus for key handling
            keyable: true, // Enable key events
            clickable: true, // Enable click events
            style: {
                ...styleWithoutBg,
                // Always use transparent ANSI background - CSS overlay provides dimming for web
                // For telnet/SSH, background shows through (acceptable - modal dialog is on top)
                bg: 'transparent',
            },
        });
        this._overlayOpacity = options.opacity !== undefined ? options.opacity : 0.5;
        this._overlayWidgetId = `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Enable key handling
        this.enableKeys();
        // Auto-focus when shown - also emit web transparency event and trap focus
        this.on('show', () => {
            console.log('[Overlay] SHOW event triggered!');
            console.log('[Overlay] About to trap focus...');
            if (this.screen) {
                this.screen.trapFocus(this);
            }
            console.log('[Overlay] Focus trapped, about to emit OSC...');
            this._emitOverlayWidgetEvent(true);
            console.log('[Overlay] OSC emitted, about to render...');
            if (this.screen) {
                this.screen.render();
            }
            console.log('[Overlay] SHOW handler complete');
        });
        // Emit hide event for web transparency and release focus trap
        this.on('hide', () => {
            console.log('[Overlay] HIDE event triggered!');
            console.trace('[Overlay] Stack trace for hide:');
            if (this.screen) {
                this.screen.releaseFocusTrap();
            }
            this._emitOverlayWidgetEvent(false);
        });
        // Default escape handler to hide overlay
        this.key(['escape'], () => {
            console.log('[Overlay] ESCAPE key pressed! Hiding overlay...');
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
    _emitOverlayWidgetEvent(show) {
        if (!this.screen) {
            console.log('[Overlay] No screen, cannot emit event');
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
        const osc = `\x1b]9999;overlay;${data}\x07`;
        console.log('[Overlay] Emitting OSC sequence:', show ? 'SHOW' : 'HIDE', 'opacity:', this._overlayOpacity, 'pos:', pos, 'id:', this._overlayWidgetId);
        console.log('[Overlay] OSC data:', data);
        console.log('[Overlay] OSC hex:', Array.from(osc).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
        // Use OSC (Operating System Command) format that won't display as text
        // Write directly through the screen's program which handles output
        this.screen.program.write(osc);
    }
    /**
     * Get overlay opacity
     */
    get opacity() {
        return this._overlayOpacity;
    }
    /**
     * Set overlay opacity (0-1)
     */
    setOpacity(opacity) {
        this._overlayOpacity = Math.max(0, Math.min(1, opacity));
        if (this.screen && !this.hidden) {
            this._emitOverlayWidgetEvent(true);
            this.screen.render();
        }
    }
    /**
     * Get overlay opacity (legacy method)
     */
    getOpacity() {
        return this._overlayOpacity;
    }
    /**
     * Show overlay with fade in effect
     */
    fadeIn(duration = 300, callback) {
        const steps = 20;
        const stepDuration = duration / steps;
        const opacityStep = this.opacity / steps;
        let currentOpacity = 0;
        const interval = setInterval(() => {
            currentOpacity += opacityStep;
            if (currentOpacity >= this.opacity) {
                currentOpacity = this.opacity;
                clearInterval(interval);
                if (callback)
                    callback();
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
    fadeOut(duration = 300, callback) {
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
                if (callback)
                    callback();
            }
            if (this.screen) {
                this.screen.render();
            }
        }, stepDuration);
    }
}
