/**
 * Context Menu widget - Right-click popup menu
 */
import { Element } from '../core/element';
export class ContextMenu extends Element {
    constructor(options) {
        super({
            parent: options.parent || options.screen,
            top: 0,
            left: 0,
            width: 20,
            height: (options.items?.length || 1) + 2,
            border: { type: 'line', fg: 'cyan' },
            style: {
                fg: 'white',
                bg: 'black',
                focus: { fg: 'white', bg: 'black' }
            },
            tags: true,
            keys: true,
            mouse: true,
            clickable: true,
            focusable: true,
            hidden: true,
            shadow: true,
        });
        this.selectedIndex = 0;
        this.items = options.items || [];
        this._updateContent();
        // Keyboard navigation
        this.on('keypress', (ch, key) => {
            if (key.name === 'up') {
                this.up();
            }
            else if (key.name === 'down') {
                this.down();
            }
            else if (key.name === 'enter' || key.name === 'space') {
                this.selectItem();
            }
            else if (key.name === 'escape') {
                this.hide();
            }
        });
        // Mouse click selection
        this.on('click', (event) => {
            const pos = this._getCoords();
            if (!pos)
                return;
            const border = 1;
            const relY = event.y - pos.yi - border;
            if (relY >= 0 && relY < this.items.length) {
                this.selectedIndex = relY;
                this.selectItem();
            }
        });
        // Mouse hover selection
        this.on('mousemove', (event) => {
            const pos = this._getCoords();
            if (!pos)
                return;
            const border = 1;
            const relY = event.y - pos.yi - border;
            if (relY >= 0 && relY < this.items.length) {
                this.selectedIndex = relY;
                this._updateContent();
                this.screen?.render();
            }
        });
        // Hide on click outside
        if (this.screen) {
            this.screen.on('click', (event) => {
                if (!this.hidden) {
                    const pos = this._getCoords();
                    if (pos && (event.x < pos.xi || event.x > pos.xl || event.y < pos.yi || event.y > pos.yl)) {
                        this.hide();
                    }
                }
            });
        }
    }
    _updateContent() {
        const lines = [];
        let maxWidth = 10;
        this.items.forEach((item, index) => {
            if (item.separator) {
                lines.push('─'.repeat(18));
            }
            else {
                const selected = index === this.selectedIndex;
                const prefix = selected ? '> ' : '  ';
                const label = item.disabled ? `{gray-fg}${item.label}{/gray-fg}` : item.label;
                const line = prefix + label;
                lines.push(line);
                // Calculate max width (excluding tags)
                const plainText = item.label.replace(/\{[^}]+\}/g, '');
                maxWidth = Math.max(maxWidth, plainText.length + 4);
            }
        });
        this.setContent(lines.join('\n'));
        this.options.width = Math.min(40, maxWidth);
        this.options.height = lines.length + 2;
        this.position.width = this.options.width;
        this.position.height = this.options.height;
    }
    up() {
        do {
            this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        } while (this.items[this.selectedIndex].separator || this.items[this.selectedIndex].disabled);
        this._updateContent();
        this.screen?.render();
    }
    down() {
        do {
            this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        } while (this.items[this.selectedIndex].separator || this.items[this.selectedIndex].disabled);
        this._updateContent();
        this.screen?.render();
    }
    selectItem() {
        const item = this.items[this.selectedIndex];
        if (item && !item.disabled && !item.separator) {
            this.hide();
            if (item.action) {
                item.action();
            }
            this.emit('select', item);
        }
    }
    /**
     * Show context menu at specific position
     */
    showAt(x, y) {
        let adjustedX = x;
        let adjustedY = y;
        // Ensure menu stays on screen
        if (this.screen) {
            const width = this.position.width || 20;
            const height = this.position.height || 10;
            const maxX = this.screen.width - width;
            const maxY = this.screen.height - height;
            if (adjustedX > maxX)
                adjustedX = maxX;
            if (adjustedY > maxY)
                adjustedY = maxY;
        }
        this.left = adjustedX;
        this.top = adjustedY;
        this.show();
        this.focus();
        this.setFront();
        this._updateContent();
        this.screen?.render();
    }
    /**
     * Hide context menu
     */
    hide() {
        super.hide();
        this.screen?.render();
    }
}
