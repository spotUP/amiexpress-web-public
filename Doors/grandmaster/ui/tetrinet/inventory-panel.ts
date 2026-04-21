/**
 * TetriNET Inventory Panel
 *
 * Displays the player's special inventory as a horizontal queue.
 * - Shows up to 15 special blocks with their letter codes
 * - Highlights the first (usable) special
 * - Updates in real-time as specials are collected/used
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { SpecialInventory } from '../../core/tetrinet/inventory';
import type { SpecialType } from '../../core/tetrinet/specials';
import { getSpecialColor, getSpecialDisplayChar } from '../../core/tetrinet/specials';

/**
 * Inventory Panel options
 */
export interface InventoryPanelOptions {
  parent: Screen;
  top: number | string;
  left: number | string;
  width?: number;
  height?: number;
  maxSlots?: number;
}

/**
 * Inventory Panel component
 */
export class InventoryPanel {
  private box: any;
  private maxSlots: number;

  constructor(options: InventoryPanelOptions) {
    this.maxSlots = options.maxSlots || 15;

    // Calculate width: each slot is 2 chars + 1 space, plus borders
    const width = options.width || (this.maxSlots * 3 + 4);

    this.box = createBox({
      parent: options.parent,
      top: options.top,
      left: options.left,
      width,
      height: options.height || 3,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Inventory ',
      content: this.renderEmpty(),
      fixed: true,  // Fixed during gameplay, not dockable
    });
  }

  /**
   * Update display with current inventory
   */
  update(inventory: SpecialInventory): void {
    const specials = inventory.getAll();
    this.box.setContent(this.renderSpecials(specials));
  }

  /**
   * Update display with special array directly
   */
  updateFromArray(specials: SpecialType[]): void {
    this.box.setContent(this.renderSpecials(specials));
  }

  /**
   * Render empty inventory
   */
  private renderEmpty(): string {
    let content = '';
    for (let i = 0; i < this.maxSlots; i++) {
      content += '{gray-fg}. {/gray-fg}';
    }
    return content;
  }

  /**
   * Render specials in inventory
   */
  private renderSpecials(specials: SpecialType[]): string {
    let content = '';

    for (let i = 0; i < this.maxSlots; i++) {
      if (i < specials.length) {
        const special = specials[i];
        const char = getSpecialDisplayChar(special);
        const color = getSpecialColor(special);

        // First slot (usable) gets highlighted background
        if (i === 0) {
          content += `{${color}-fg}{white-bg}{bold}${char}{/bold}{/white-bg}{/${color}-fg} `;
        } else {
          content += `{${color}-fg}${char}{/${color}-fg} `;
        }
      } else {
        content += '{gray-fg}. {/gray-fg}';
      }
    }

    return content;
  }

  /**
   * Show use animation for first slot
   */
  showUseAnimation(): void {
    // Flash the panel border
    this.box.style.border.fg = 'yellow';
    setTimeout(() => {
      this.box.style.border.fg = 'cyan';
    }, 100);
  }

  /**
   * Show receive animation when special is added
   */
  showReceiveAnimation(): void {
    // Flash the panel border green
    this.box.style.border.fg = 'green';
    setTimeout(() => {
      this.box.style.border.fg = 'cyan';
    }, 100);
  }

  /**
   * Get the blessed box element
   */
  getElement(): any {
    return this.box;
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    this.box.destroy();
  }
}
