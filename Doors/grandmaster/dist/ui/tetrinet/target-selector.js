"use strict";
/**
 * TetriNET Target Selector
 *
 * Allows players to select targets for special attacks.
 * - Displays list of opponents (up to 5)
 * - Highlights current target
 * - Shows opponent status (alive/dead, immunity)
 * - Keyboard navigation (tab/number keys)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetSelector = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Target Selector component
 */
class TargetSelector {
    constructor(options) {
        this.opponents = [];
        this.selectedIndex = 0;
        this.onTargetChangeCallbacks = [];
        this.box = (0, blessed_helpers_1.createBox)({
            parent: options.parent,
            top: options.top,
            left: options.left,
            width: options.width || 25,
            height: options.height || 8,
            border: { type: 'line' },
            style: { border: { fg: 'yellow' } },
            label: ' Target ',
            content: '{gray-fg}No opponents{/gray-fg}',
            fixed: true, // Fixed during gameplay, not dockable
        });
    }
    /**
     * Set opponents list
     */
    setOpponents(opponents) {
        this.opponents = opponents;
        // Validate selection
        if (this.selectedIndex >= this.opponents.length) {
            this.selectedIndex = Math.max(0, this.opponents.length - 1);
        }
        this.render();
    }
    /**
     * Update a single opponent's status
     */
    updateOpponent(id, updates) {
        const index = this.opponents.findIndex(o => o.id === id);
        if (index >= 0) {
            this.opponents[index] = { ...this.opponents[index], ...updates };
            this.render();
        }
    }
    /**
     * Add opponent
     */
    addOpponent(opponent) {
        // Don't add duplicates
        if (!this.opponents.find(o => o.id === opponent.id)) {
            this.opponents.push(opponent);
            this.render();
        }
    }
    /**
     * Remove opponent
     */
    removeOpponent(id) {
        const index = this.opponents.findIndex(o => o.id === id);
        if (index >= 0) {
            this.opponents.splice(index, 1);
            // Adjust selection if needed
            if (this.selectedIndex >= this.opponents.length) {
                this.selectedIndex = Math.max(0, this.opponents.length - 1);
            }
            this.render();
        }
    }
    /**
     * Select next target
     */
    selectNext() {
        if (this.opponents.length === 0)
            return;
        // Find next alive opponent
        let attempts = this.opponents.length;
        do {
            this.selectedIndex = (this.selectedIndex + 1) % this.opponents.length;
            attempts--;
        } while (attempts > 0 && !this.opponents[this.selectedIndex].alive);
        this.render();
        this.notifyTargetChange();
    }
    /**
     * Select previous target
     */
    selectPrevious() {
        if (this.opponents.length === 0)
            return;
        // Find previous alive opponent
        let attempts = this.opponents.length;
        do {
            this.selectedIndex = (this.selectedIndex - 1 + this.opponents.length) % this.opponents.length;
            attempts--;
        } while (attempts > 0 && !this.opponents[this.selectedIndex].alive);
        this.render();
        this.notifyTargetChange();
    }
    /**
     * Select target by number (1-5)
     */
    selectByNumber(num) {
        const index = num - 1;
        if (index >= 0 && index < this.opponents.length && this.opponents[index].alive) {
            this.selectedIndex = index;
            this.render();
            this.notifyTargetChange();
        }
    }
    /**
     * Get currently selected target
     */
    getSelectedTarget() {
        if (this.opponents.length === 0)
            return null;
        const target = this.opponents[this.selectedIndex];
        return target && target.alive ? target : null;
    }
    /**
     * Register callback for target changes
     */
    onTargetChange(callback) {
        this.onTargetChangeCallbacks.push(callback);
        return () => {
            const index = this.onTargetChangeCallbacks.indexOf(callback);
            if (index >= 0) {
                this.onTargetChangeCallbacks.splice(index, 1);
            }
        };
    }
    /**
     * Notify target change callbacks
     */
    notifyTargetChange() {
        const target = this.getSelectedTarget();
        for (const callback of this.onTargetChangeCallbacks) {
            callback(target);
        }
    }
    /**
     * Render the target list
     */
    render() {
        if (this.opponents.length === 0) {
            this.box.setContent('{gray-fg}No opponents{/gray-fg}');
            return;
        }
        let content = '';
        for (let i = 0; i < this.opponents.length; i++) {
            const opponent = this.opponents[i];
            const isSelected = i === this.selectedIndex;
            const num = i + 1;
            // Status indicators
            let statusIcon = '';
            let statusColor = 'white';
            if (!opponent.alive) {
                statusIcon = '{red-fg}[X]{/red-fg} ';
                statusColor = 'gray';
            }
            else if (opponent.hasImmunity) {
                statusIcon = '{cyan-fg}[I]{/cyan-fg} ';
                statusColor = 'cyan';
            }
            // Format name (truncate if needed)
            const displayName = opponent.name.substring(0, 12).padEnd(12, ' ');
            // Build line
            if (isSelected && opponent.alive) {
                content += `{yellow-bg}{black-fg}${num}. ${statusIcon}${displayName}{/black-fg}{/yellow-bg}\n`;
            }
            else {
                content += `{${statusColor}-fg}${num}. ${statusIcon}${displayName}{/${statusColor}-fg}\n`;
            }
        }
        // Instructions
        content += '\n{gray-fg}TAB: Next  1-5: Select{/gray-fg}';
        this.box.setContent(content.trim());
    }
    /**
     * Show attack animation on target
     */
    showAttackAnimation(targetId) {
        const index = this.opponents.findIndex(o => o.id === targetId);
        if (index < 0)
            return;
        // Flash the border
        this.box.style.border.fg = 'red';
        setTimeout(() => {
            this.box.style.border.fg = 'yellow';
        }, 200);
    }
    /**
     * Show immunity blocked animation
     */
    showBlockedAnimation(targetId) {
        const index = this.opponents.findIndex(o => o.id === targetId);
        if (index < 0)
            return;
        // Flash cyan for immunity block
        this.box.style.border.fg = 'cyan';
        setTimeout(() => {
            this.box.style.border.fg = 'yellow';
        }, 200);
    }
    /**
     * Get the blessed box element
     */
    getElement() {
        return this.box;
    }
    /**
     * Destroy the panel
     */
    destroy() {
        this.onTargetChangeCallbacks = [];
        this.box.destroy();
    }
}
exports.TargetSelector = TargetSelector;
//# sourceMappingURL=target-selector.js.map