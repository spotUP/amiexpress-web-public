"use strict";
/**
 * TetriNET Inventory Panel
 *
 * Displays the player's special inventory as a horizontal queue.
 * - Shows up to 15 special blocks with their letter codes
 * - Highlights the first (usable) special
 * - Updates in real-time as specials are collected/used
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryPanel = void 0;
const dockable_1 = require("../dockable");
const specials_1 = require("../../core/tetrinet/specials");
/**
 * Inventory Panel component
 */
class InventoryPanel {
    constructor(options) {
        this.maxSlots = options.maxSlots || 15;
        // Calculate width: each slot is 2 chars + 1 space, plus borders
        const width = options.width || (this.maxSlots * 3 + 4);
        this.box = (0, dockable_1.createDockable)({
            parent: options.parent,
            top: options.top,
            left: options.left,
            width,
            height: options.height || 3,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' Inventory ',
            content: this.renderEmpty(),
            persistenceKey: 'grandmaster.tnet.inventory',
        });
    }
    /**
     * Update display with current inventory
     */
    update(inventory) {
        const specials = inventory.getAll();
        this.box.setContent(this.renderSpecials(specials));
    }
    /**
     * Update display with special array directly
     */
    updateFromArray(specials) {
        this.box.setContent(this.renderSpecials(specials));
    }
    /**
     * Render empty inventory
     */
    renderEmpty() {
        let content = '';
        for (let i = 0; i < this.maxSlots; i++) {
            content += '{gray-fg}. {/gray-fg}';
        }
        return content;
    }
    /**
     * Render specials in inventory
     */
    renderSpecials(specials) {
        let content = '';
        for (let i = 0; i < this.maxSlots; i++) {
            if (i < specials.length) {
                const special = specials[i];
                const char = (0, specials_1.getSpecialDisplayChar)(special);
                const color = (0, specials_1.getSpecialColor)(special);
                // First slot (usable) gets highlighted background
                if (i === 0) {
                    content += `{${color}-fg}{white-bg}{bold}${char}{/bold}{/white-bg}{/${color}-fg} `;
                }
                else {
                    content += `{${color}-fg}${char}{/${color}-fg} `;
                }
            }
            else {
                content += '{gray-fg}. {/gray-fg}';
            }
        }
        return content;
    }
    /**
     * Show use animation for first slot
     */
    showUseAnimation() {
        // Flash the panel border
        this.box.style.border.fg = 'yellow';
        setTimeout(() => {
            this.box.style.border.fg = 'cyan';
        }, 100);
    }
    /**
     * Show receive animation when special is added
     */
    showReceiveAnimation() {
        // Flash the panel border green
        this.box.style.border.fg = 'green';
        setTimeout(() => {
            this.box.style.border.fg = 'cyan';
        }, 100);
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
        this.box.destroy();
    }
}
exports.InventoryPanel = InventoryPanel;
//# sourceMappingURL=inventory-panel.js.map