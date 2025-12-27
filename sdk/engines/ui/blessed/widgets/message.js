/**
 * Message - Simple message dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import { Button } from './button';
import { Overlay } from './overlay';
export class Message extends Box {
    constructor(options = {}) {
        // Force fixed height - 'shrink' doesn't work well with nested elements
        const height = typeof options.height === 'number' ? options.height : 12;
        // If overlay is enabled, we'll reparent to the overlay later
        const originalParent = options.parent;
        const useOverlay = options.overlay || options.overlayOpacity !== undefined;
        super({
            ...options,
            parent: useOverlay ? undefined : originalParent, // Don't set parent yet if using overlay
            border: options.border || { type: 'line' },
            label: options.title || options.label || ' Message ',
            width: options.width || 40,
            height: height,
            top: options.top || 'center',
            left: options.left || 'center',
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            hidden: true,
            focusable: true,
            shadow: false, // Disable shadow - causes rendering issues
            ch: ' ', // Fill character for solid background
            style: {
                ...options.style,
                bg: options.style?.bg || 'black',
            },
        });
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
        // Message text - centered
        // Use 'transparent' for bg to inherit from parent dialog
        const dialogBg = options.style?.bg || 'black';
        const messageHeight = Math.max(3, height - 7);
        this.messageText = new Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: messageHeight,
            content: options.text || '',
            tags: true,
            align: 'center',
            valign: 'middle',
            style: {
                fg: options.style?.fg || 'white',
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // OK button
        this.okButton = new Button({
            parent: this,
            bottom: 0,
            left: 'center',
            width: 10,
            height: 3,
            content: '[ OK ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            mouse: true,
            style: {
                fg: 'white',
                bg: 'blue',
                border: { fg: 'blue' },
                hover: { bg: 'lightblue', fg: 'black' },
                focus: { bg: 'lightblue', fg: 'black' },
            },
        });
        this.okButton.on('press', () => {
            this.hide();
            this.emit('ok');
            this.emit('hide');
        });
        // Close on escape
        this.key(['escape'], () => {
            this.hide();
            this.emit('hide');
        });
        // Close on enter
        this.key(['enter'], () => {
            this.hide();
            this.emit('ok');
            this.emit('hide');
        });
    }
    /**
     * Display the message
     */
    display(text, callback) {
        if (text) {
            this.setText(text);
        }
        // Show overlay first if present
        if (this._overlay) {
            this._overlay.show();
        }
        this.show();
        this.setFront();
        this.okButton.focus();
        this.screen?.render();
        if (callback) {
            this.once('hide', callback);
        }
    }
    /**
     * Override hide to also hide overlay
     */
    hide() {
        super.hide();
        if (this._overlay) {
            this._overlay.hide();
        }
    }
    /**
     * Set message text
     */
    setText(text) {
        this.messageText.setContent(text);
    }
    /**
     * Get message text
     */
    getText() {
        return this.messageText.getContent();
    }
}
