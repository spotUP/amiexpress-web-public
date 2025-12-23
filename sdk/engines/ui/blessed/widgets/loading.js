"use strict";
/**
 * Loading - Loading indicator / spinner widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Loading = void 0;
const box_1 = require("./box");
class Loading extends box_1.Box {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border || { type: 'line' },
            label: options.label || ' Loading ',
            width: options.width || '50%',
            height: options.height || 5,
            top: options.top || 'center',
            left: options.left || 'center',
            padding: options.padding || 1,
            hidden: true,
            focusable: false,
            shadow: options.shadow !== false,
        });
        this.spinnerIndex = 0;
        this.timer = null;
        this.spinner = options.spinner || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = options.interval || 80;
        // Loading message
        this.messageText = new box_1.Box({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            content: options.text || 'Please wait...',
            tags: true,
            align: 'center',
        });
        // Spinner
        this.spinnerText = new box_1.Box({
            parent: this,
            top: 1,
            left: 'center',
            width: 3,
            height: 1,
            content: this.spinner[0],
            align: 'center',
            style: {
                fg: 'blue',
                bold: true,
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
        this.show();
        this.setFront();
        // Start spinner animation
        this.startSpinner();
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
        super.destroy();
    }
}
exports.Loading = Loading;
