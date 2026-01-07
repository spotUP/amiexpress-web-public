/**
 * Loading - Loading indicator / spinner widget
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 *
 * Automatically stays centered in responsive layouts
 */
import { Box } from './box';
import { Overlay } from './overlay';
import { makeModalResponsive } from '../utils/modal-helpers';
export class Loading extends Box {
    constructor(options = {}) {
        // If overlay is enabled, we'll reparent to the overlay later
        const originalParent = options.parent;
        const useOverlay = options.overlay || options.overlayOpacity !== undefined;
        // Use 'transparent' for bg to inherit from parent dialog
        const dialogBg = options.style?.bg || 'black';
        super({
            ...options,
            parent: useOverlay ? undefined : originalParent,
            border: options.border || { type: 'line' },
            label: options.label || ' Loading ',
            width: options.width || '50%',
            height: options.height || 5,
            top: options.top || 'center',
            left: options.left || 'center',
            padding: options.padding || 1,
            hidden: true,
            focusable: false,
            shadow: false, // Disable shadow - causes rendering issues
            ch: ' ', // Fill character for solid background
            style: {
                ...options.style,
                bg: dialogBg,
            },
        });
        this.spinnerIndex = 0;
        this.timer = null;
        // Create overlay if enabled
        if (useOverlay && originalParent) {
            const overlayOpacity = options.overlayOpacity ?? 0.5;
            this._overlay = new Overlay({
                parent: originalParent,
                opacity: overlayOpacity,
                hidden: true,
            });
            // Reparent dialog to overlay
            this._overlay.append(this);
        }
        this.spinner = options.spinner || ['|', '/', '-', '\\']; // ASCII spinner for terminal compatibility
        this.interval = options.interval || 80;
        // Loading message
        this.messageText = new Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            content: options.text || 'Please wait...',
            tags: true,
            align: 'center',
            style: {
                fg: options.style?.fg || 'white',
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // Spinner
        this.spinnerText = new Box({
            parent: this,
            top: 1,
            left: 'center',
            width: 3,
            height: 1,
            content: this.spinner[0],
            align: 'center',
            style: {
                fg: 'cyan',
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
    }
    /**
     * Start the loading animation
     */
    load(text) {
        if (text) {
            this.setText(text);
        }
        // Show overlay first if present
        if (this._overlay) {
            this._overlay.show();
        }
        // Enable responsive centering
        if (!this._responsiveCleanup) {
            this._responsiveCleanup = makeModalResponsive(this);
        }
        this.show();
        this.setFront();
        // Start spinner animation
        this.startSpinner();
        this.screen?.render();
    }
    /**
     * Stop the loading animation and hide
     */
    stop() {
        this.stopSpinner();
        this.hide();
        this.screen?.render();
    }
    /**
     * Override hide to also hide overlay
     */
    hide() {
        super.hide();
        if (this._overlay) {
            this._overlay.hide();
        }
        // Don't cleanup responsive listener on hide - keep it for next show
    }
    /**
     * Start spinner animation
     */
    startSpinner() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner.length;
            this.spinnerText.setContent(this.spinner[this.spinnerIndex]);
            if (this.screen) {
                this.screen.render();
            }
        }, this.interval);
    }
    /**
     * Stop spinner animation
     */
    stopSpinner() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
     * Set loading text
     */
    setText(text) {
        this.messageText.setContent(text);
    }
    /**
     * Get loading text
     */
    getText() {
        return this.messageText.getContent();
    }
    /**
     * Set custom spinner frames
     */
    setSpinner(frames) {
        this.spinner = frames;
        this.spinnerIndex = 0;
    }
    /**
     * Destroy and clean up
     */
    destroy() {
        this.stopSpinner();
        if (this._responsiveCleanup) {
            this._responsiveCleanup();
            this._responsiveCleanup = undefined;
        }
        if (this._overlay) {
            this._overlay.destroy();
        }
        super.destroy();
    }
}
