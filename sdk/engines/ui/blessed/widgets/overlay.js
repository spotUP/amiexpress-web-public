/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 */
import { Box } from './box';
export class Overlay extends Box {
    constructor(options = {}) {
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
                bg: 'black',
                ...(options.style || {}),
            },
        });
        this._opacity = options.opacity !== undefined ? options.opacity : 0.5;
        this._overlayId = `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Enable key handling
        this.enableKeys();
        // Auto-focus when shown - also emit web transparency event
        this.on('show', () => {
            this.focus();
            this._emitOverlayEvent(true);
            if (this.screen) {
                this.screen.render();
            }
        });
        // Emit hide event for web transparency
        this.on('hide', () => {
            this._emitOverlayEvent(false);
        });
        // Default escape handler to hide overlay
        this.key(['escape'], () => {
            this.hide();
            this.emit('cancel');
            if (this.screen) {
                this.screen.render();
            }
        });
    }
    /**
     * Emit overlay event for web clients to render actual transparency
     */
    _emitOverlayEvent(show) {
        if (!this.screen) {
            console.log('[Overlay] No screen, cannot emit event');
            return;
        }
        // Send a special escape sequence that the frontend can intercept
        // Format: ESC ] 9999 ; overlay ; <json> BEL
        const data = JSON.stringify({
            id: this._overlayId,
            show,
            opacity: this._opacity,
        });
        const osc = `\x1b]9999;overlay;${data}\x07`;
        console.log('[Overlay] Emitting OSC sequence:', show ? 'SHOW' : 'HIDE', 'opacity:', this._opacity, 'id:', this._overlayId);
        // Use OSC (Operating System Command) format that won't display as text
        // Write directly through the screen's program which handles output
        this.screen.program.write(osc);
    }
    /**
     * Get overlay opacity
     */
    get opacity() {
        return this._opacity;
    }
    /**
     * Set overlay opacity (0-1)
     */
    setOpacity(opacity) {
        this._opacity = Math.max(0, Math.min(1, opacity));
        if (this.screen && !this.hidden) {
            this._emitOverlayEvent(true);
            this.screen.render();
        }
    }
    /**
     * Get overlay opacity (legacy method)
     */
    getOpacity() {
        return this._opacity;
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
