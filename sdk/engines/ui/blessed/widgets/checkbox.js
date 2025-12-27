/**
 * Checkbox - Boolean toggle widget for forms
 */
import { Box } from './box';
export class Checkbox extends Box {
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
        this.checkChar = options.checkChar || 'X';
        this.uncheckChar = options.uncheckChar || ' ';
        this.enableMouse();
        this.enableKeys();
        // Update display
        this.updateContent();
        // Toggle on click
        this.on('click', () => {
            this.toggle();
        });
        // Toggle on space/enter
        this.key(['space', 'enter'], () => {
            this.toggle();
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
     * Update checkbox display
     */
    updateContent() {
        const checkbox = `[${this._checked ? this.checkChar : this.uncheckChar}]`;
        this.setContent(this.text ? `${checkbox} ${this.text}` : checkbox);
    }
    /**
     * Check the checkbox
     */
    check() {
        if (this._checked)
            return;
        this._checked = true;
        this.updateContent();
        this.emit('check');
        this.emit('change', this._checked);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Uncheck the checkbox
     */
    uncheck() {
        if (!this._checked)
            return;
        this._checked = false;
        this.updateContent();
        this.emit('uncheck');
        this.emit('change', this._checked);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Toggle checkbox state
     */
    toggle() {
        if (this._checked) {
            this.uncheck();
        }
        else {
            this.check();
        }
    }
    /**
     * Get checked state
     */
    isChecked() {
        return this._checked;
    }
    /**
     * Set checked state
     */
    setChecked(checked) {
        if (checked) {
            this.check();
        }
        else {
            this.uncheck();
        }
    }
    /**
     * Get checkbox value (for form compatibility)
     */
    getValue() {
        return this._checked;
    }
    /**
     * Set checkbox value (for form compatibility)
     */
    setValue(value) {
        this.setChecked(value);
    }
}
