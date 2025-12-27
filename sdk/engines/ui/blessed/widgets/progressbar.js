/**
 * ProgressBar widget - Visual progress indicator
 */
import { Element } from '../core/element';
export class ProgressBar extends Element {
    constructor(options = {}) {
        super({
            border: 'line',
            ...options,
        });
        this.filled = 0;
        this.orientation = 'horizontal';
        this.ch = '█';
        this.pch = ' ';
        this.filled = options.filled || options.value || 0;
        this.orientation = options.orientation || 'horizontal';
        this.ch = options.ch || '█';
        this.pch = options.pch || ' ';
        this._updateContent();
    }
    _updateContent() {
        const pos = this._getCoords();
        if (!pos)
            return;
        const padding = this.options.padding || 0;
        const border = this.options.border ? 1 : 0;
        const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
        const padTop = typeof padding === 'number' ? padding : padding.top || 0;
        const padRight = typeof padding === 'number' ? padding : padding.right || 0;
        const padBottom = typeof padding === 'number' ? padding : padding.bottom || 0;
        const width = pos.xl - pos.xi - border * 2 - padLeft - padRight;
        const height = pos.yl - pos.yi - border * 2 - padTop - padBottom;
        if (this.orientation === 'horizontal') {
            const filledWidth = Math.floor((width * this.filled) / 100);
            const bar = this.ch.repeat(filledWidth) + this.pch.repeat(width - filledWidth);
            this.setContent(bar);
        }
        else {
            const filledHeight = Math.floor((height * this.filled) / 100);
            const lines = [];
            for (let i = 0; i < height; i++) {
                if (i < height - filledHeight) {
                    lines.push(this.pch.repeat(width));
                }
                else {
                    lines.push(this.ch.repeat(width));
                }
            }
            this.setContent(lines.join('\n'));
        }
    }
    setProgress(percent) {
        this.filled = Math.max(0, Math.min(100, percent));
        this._updateContent();
        this.emit('progress', this.filled);
    }
    getProgress() {
        return this.filled;
    }
    progress(amount) {
        this.setProgress(this.filled + amount);
    }
    reset() {
        this.setProgress(0);
    }
}
