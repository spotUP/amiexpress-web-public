"use strict";
/**
 * RadioButton - Single radio button (usually used within RadioSet)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RadioButton = void 0;
const box_1 = require("./box");
class RadioButton extends box_1.Box {
    constructor(options = {}) {
        super({
            ...options,
            focusable: true,
            clickable: true,
            height: options.height || 1,
            width: options.width || (options.text ? options.text.length + 4 : 3),
        });
        this._checked = false;
        this._checked = options.checked || false;
        this.text = options.text || '';
        this.checkChar = options.checkChar || 'O';
        this.uncheckChar = options.uncheckChar || ' ';
        this.value = options.value !== undefined ? options.value : this.text;
        this.enableMouse();
        this.enableKeys();
        // Update display
        this.updateContent();
        // Select on click
        this.on('click', () => {
            this.select();
        });
        // Select on space/enter
        this.key(['space', 'enter'], () => {
            this.select();
        });
        // Focus styling
        this.on('focus', () => {
            if (this.options.style && this.options.style.focus) {
                this.options.style = { ...this.options.style, ...this.options.style.focus };
            }
            this.screen?.render();
        });
        this.on('blur', () => {
            if (this.options.style && this.options.style.focus) {
                // Reset to original style (simplified)
                this.screen?.render();
            }
        });
    }
    /**
     * Update radio button display
     */
    updateContent() {
        const radio = `(${this._checked ? this.checkChar : this.uncheckChar})`;
        this.setContent(this.text ? `${radio} ${this.text}` : radio);
    }
    /**
     * Select this radio button
     */
    select() {
        if (this._checked)
            return;
        this._checked = true;
        this.updateContent();
        this.emit('select');
        this.emit('change', true);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Deselect this radio button
     */
    deselect() {
        if (!this._checked)
            return;
        this._checked = false;
        this.updateContent();
        this.emit('deselect');
        this.emit('change', false);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get selected state
     */
    isSelected() {
        return this._checked;
    }
    /**
     * Set selected state
     */
    setSelected(selected) {
        if (selected) {
            this.select();
        }
        else {
            this.deselect();
        }
    }
    /**
     * Get radio button value
     */
    getValue() {
        return this._checked ? this.value : null;
    }
}
exports.RadioButton = RadioButton;
