/**
 * Question - Yes/No dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import { Button } from './button';
import { Overlay } from './overlay';
export class Question extends Box {
    constructor(options = {}) {
        // Force fixed height - 'shrink' doesn't work well with nested elements
        const height = typeof options.height === 'number' ? options.height : 9;
        // If overlay is enabled, we'll reparent to the overlay later
        const originalParent = options.parent;
        const useOverlay = options.overlay || options.overlayOpacity !== undefined;
        super({
            ...options,
            parent: useOverlay ? undefined : originalParent,
            border: options.border || { type: 'line' },
            label: options.title || options.label || ' Confirm ',
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
            this._overlay.append(this);
        }
        // Question text - centered at top
        // Use 'transparent' for bg to inherit from parent dialog
        const dialogBg = options.style?.bg || 'black';
        this.messageText = new Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            content: options.text || '',
            tags: true,
            align: 'center',
            valign: 'middle',
            style: {
                fg: options.style?.fg || 'white',
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // Button container for centering both buttons
        this.buttonBox = new Box({
            parent: this,
            bottom: 0,
            left: 'center',
            width: 22,
            height: 3,
            style: {
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // Yes button
        this.yesButton = new Button({
            parent: this.buttonBox,
            top: 0,
            left: 0,
            width: 10,
            height: 3,
            content: '[ Yes ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            mouse: true,
            style: {
                fg: 'white',
                bg: 'green',
                border: { fg: 'green' },
                hover: { bg: 'lightgreen', fg: 'black' },
                focus: { bg: 'lightgreen', fg: 'black' },
            },
        });
        // No button
        this.noButton = new Button({
            parent: this.buttonBox,
            top: 0,
            left: 12,
            width: 10,
            height: 3,
            content: '[ No ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            mouse: true,
            style: {
                fg: 'white',
                bg: 'red',
                border: { fg: 'red' },
                hover: { bg: 'lightred', fg: 'black' },
                focus: { bg: 'lightred', fg: 'black' },
            },
        });
        this.yesButton.on('press', () => {
            this.hide();
            this.emit('yes');
            this.emit('answer', true);
            this.emit('hide');
        });
        this.noButton.on('press', () => {
            this.hide();
            this.emit('no');
            this.emit('answer', false);
            this.emit('hide');
        });
        // Close on escape (same as No)
        this.key(['escape'], () => {
            this.hide();
            this.emit('no');
            this.emit('answer', false);
            this.emit('hide');
        });
        // Yes on enter/y
        this.key(['enter', 'y'], () => {
            this.hide();
            this.emit('yes');
            this.emit('answer', true);
            this.emit('hide');
        });
        // No on n
        this.key(['n'], () => {
            this.hide();
            this.emit('no');
            this.emit('answer', false);
            this.emit('hide');
        });
        // Tab between buttons
        this.key(['tab'], () => {
            if (this.yesButton.focused) {
                this.noButton.focus();
            }
            else {
                this.yesButton.focus();
            }
            this.screen?.render();
        });
    }
    /**
     * Display the question
     */
    ask(text, callback) {
        if (text) {
            this.setText(text);
        }
        // Show overlay first if present
        if (this._overlay) {
            this._overlay.show();
        }
        this.show();
        this.setFront();
        this.yesButton.focus();
        this.screen?.render();
        if (callback) {
            this.once('answer', callback);
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
     * Set question text
     */
    setText(text) {
        this.messageText.setContent(text);
    }
    /**
     * Get question text
     */
    getText() {
        return this.messageText.getContent();
    }
}
