/**
 * Message - Simple message dialog box
 */
import { Box } from './box';
import { Button } from './button';
export class Message extends Box {
    constructor(options = {}) {
        // Force fixed height - 'shrink' doesn't work well with nested elements
        const height = typeof options.height === 'number' ? options.height : 12;
        super({
            ...options,
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
        this.show();
        this.setFront();
        this.okButton.focus();
        this.screen?.render();
        if (callback) {
            this.once('hide', callback);
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
