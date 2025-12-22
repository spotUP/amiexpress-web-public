/**
 * Prompt - Text input dialog box
 */
import { Box } from './box';
import { Textbox } from './textbox';
import { Button } from './button';
export class Prompt extends Box {
    constructor(options = {}) {
        // Force fixed height - 'shrink' doesn't work well with nested elements
        const height = typeof options.height === 'number' ? options.height : 12;
        super({
            ...options,
            border: options.border || { type: 'line' },
            label: options.title || options.label || ' Input ',
            width: options.width || 50,
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
        // Prompt text - at top
        // Use 'transparent' for bg to inherit from parent dialog
        const dialogBg = options.style?.bg || 'black';
        this.messageText = new Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 2,
            content: options.text || '',
            tags: true,
            style: {
                fg: options.style?.fg || 'white',
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // Input field - use right: 0 to respect parent boundaries
        // Input field keeps solid background for readability
        this.inputField = new Textbox({
            parent: this,
            top: 2,
            left: 0,
            right: 0,
            height: 3,
            border: { type: 'line' },
            inputOnFocus: true,
            mouse: true,
            value: options.value || '',
            style: {
                fg: 'white',
                bg: 'black',
                border: { fg: 'gray' },
            },
        });
        // Button container
        this.buttonBox = new Box({
            parent: this,
            bottom: 0,
            left: 'center',
            width: 26,
            height: 3,
            style: {
                bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
            },
        });
        // OK button
        this.okButton = new Button({
            parent: this.buttonBox,
            top: 0,
            left: 0,
            width: 12,
            height: 3,
            content: '[ OK ]',
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
        // Cancel button
        this.cancelButton = new Button({
            parent: this.buttonBox,
            top: 0,
            left: 14,
            width: 12,
            height: 3,
            content: '[ Cancel ]',
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
        this.okButton.on('press', () => {
            const value = this.inputField.getValue();
            this.hide();
            this.emit('submit', value);
            this.emit('hide');
        });
        this.cancelButton.on('press', () => {
            this.hide();
            this.emit('cancel');
            this.emit('hide');
        });
        // Submit on enter in input field
        this.inputField.key(['enter'], () => {
            const value = this.inputField.getValue();
            this.hide();
            this.emit('submit', value);
            this.emit('hide');
        });
        // Cancel on escape
        this.key(['escape'], () => {
            this.hide();
            this.emit('cancel');
            this.emit('hide');
        });
        // Tab between elements
        this.key(['tab'], () => {
            const focused = this.screen?.getFocused();
            if (focused === this.inputField) {
                this.okButton.focus();
            }
            else if (focused === this.okButton) {
                this.cancelButton.focus();
            }
            else {
                this.inputField.focus();
            }
            this.screen?.render();
        });
    }
    /**
     * Display the prompt
     */
    showInput(text, value, callback) {
        if (text) {
            this.setText(text);
        }
        if (value !== undefined) {
            this.setValue(value);
        }
        this.show();
        this.setFront();
        this.inputField.focus();
        this.screen?.render();
        if (callback) {
            this.once('submit', (value) => {
                callback(null, value);
            });
            this.once('cancel', () => {
                callback(new Error('cancelled'));
            });
        }
    }
    /**
     * Set prompt text
     */
    setText(text) {
        this.messageText.setContent(text);
    }
    /**
     * Get prompt text
     */
    getText() {
        return this.messageText.getContent();
    }
    /**
     * Set input value
     */
    setValue(value) {
        this.inputField.setValue(value);
    }
    /**
     * Get input value
     */
    getValue() {
        return this.inputField.getValue();
    }
}
