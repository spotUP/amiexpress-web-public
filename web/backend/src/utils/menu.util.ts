import { AnsiUtil } from './ansi.util';

/**
 * Menu Utility
 * Provides arrow-key navigable menus for BBS interfaces
 */

export interface MenuItem {
  label: string;
  key?: string;  // Optional hotkey (e.g., 'L' for List)
  action: string;  // Action identifier
  description?: string;  // Optional description text
}

export interface MenuState {
  title: string;
  items: MenuItem[];
  selectedIndex: number;
  footer?: string;
  /**
   * Maximum rows to render at once. Omit (or <= 0) for the original
   * behaviour: every item, every render - fine for short menus, but a
   * 20-row list (e.g. the webhook trigger picker) both scrolls the
   * terminal off-screen AND redraws the FULL list on every single
   * keystroke (renderMenu clears and reprints from scratch each call),
   * which is what made that screen visibly "jump" while navigating.
   * When set, only a window of `maxVisible` rows around selectedIndex is
   * drawn, with "N more above/below" markers so the full list stays
   * discoverable without scrolling the terminal itself.
   */
  maxVisible?: number;
}

export class MenuUtil {
  /**
   * ANSI codes for menu rendering
   */
  private static readonly SELECTED_BG = '\x1b[7m';  // Reverse video (inverted colors)
  private static readonly RESET = '\x1b[0m';
  private static readonly CYAN = '\x1b[36m';
  private static readonly YELLOW = '\x1b[33m';
  private static readonly WHITE = '\x1b[37m';
  private static readonly BLUE = '\x1b[34m';

  /**
   * Render a menu with the current selection highlighted
   */
  static renderMenu(state: MenuState): string {
    let output = '';

    // Clear screen and show title
    output += AnsiUtil.clearScreen();
    output += AnsiUtil.headerBox(state.title);
    output += '\r\n';

    // Render menu items - windowed around selectedIndex when maxVisible is
    // set and the list is actually longer than that (otherwise every item
    // renders, matching the original unwindowed behaviour exactly).
    const total = state.items.length;
    const maxVisible = state.maxVisible && state.maxVisible > 0 ? state.maxVisible : total;
    let start = 0;
    if (total > maxVisible) {
      // Keep the selection roughly centered in the window rather than
      // pinned to an edge, clamped so the window never runs past either
      // end of the list.
      start = state.selectedIndex - Math.floor(maxVisible / 2);
      start = Math.max(0, Math.min(start, total - maxVisible));
    }
    const end = Math.min(total, start + maxVisible);

    if (start > 0) {
      output += this.WHITE + `   ↑ ${start} more above` + this.RESET + '\r\n';
    }

    for (let index = start; index < end; index++) {
      const item = state.items[index];
      const isSelected = index === state.selectedIndex;

      if (isSelected) {
        // Highlighted selection with reverse video
        output += this.SELECTED_BG;
        output += this.CYAN;
        output += ' > ';
        output += this.YELLOW;
        output += item.label;
        if (item.description) {
          output += this.WHITE + ' - ' + item.description;
        }
        output += this.RESET;
        output += '\r\n';
      } else {
        // Normal item
        output += '   ';
        output += this.CYAN + item.label + this.RESET;
        if (item.description) {
          output += this.WHITE + ' - ' + item.description + this.RESET;
        }
        output += '\r\n';
      }
    }

    if (end < total) {
      output += this.WHITE + `   ↓ ${total - end} more below` + this.RESET + '\r\n';
    }

    output += '\r\n';
    output += this.BLUE + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + this.RESET + '\r\n';

    // Footer instructions
    if (state.footer) {
      output += this.WHITE + state.footer + this.RESET + '\r\n';
    } else {
      output += this.WHITE + 'Use ' + this.CYAN + '↑↓ arrows' + this.WHITE + ' to navigate, ' + this.CYAN + 'ENTER' + this.WHITE + ' to select, ' + this.CYAN + 'Q' + this.WHITE + ' to quit' + this.RESET + '\r\n';
    }
    output += this.BLUE + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + this.RESET + '\r\n';

    return output;
  }

  /**
   * Handle arrow key input for menu navigation
   * Returns: { action: string | null, newIndex: number }
   */
  static handleMenuInput(input: string, currentIndex: number, itemCount: number): { action: string | null, newIndex: number } {
    // Arrow up: \x1b[A
    if (input === '\x1b[A') {
      return {
        action: null,
        newIndex: currentIndex > 0 ? currentIndex - 1 : itemCount - 1  // Wrap to bottom
      };
    }

    // Arrow down: \x1b[B
    if (input === '\x1b[B') {
      return {
        action: null,
        newIndex: currentIndex < itemCount - 1 ? currentIndex + 1 : 0  // Wrap to top
      };
    }

    // Enter: \r
    if (input === '\r' || input === '\n') {
      return {
        action: 'select',
        newIndex: currentIndex
      };
    }

    // Q or ESC: quit
    if (input.toUpperCase() === 'Q' || input === '\x1b') {
      return {
        action: 'quit',
        newIndex: currentIndex
      };
    }

    // Check for hotkey match
    const upperInput = input.toUpperCase();
    return {
      action: upperInput.length === 1 ? `hotkey:${upperInput}` : null,
      newIndex: currentIndex
    };
  }

  /**
   * Create a simple list selection menu
   * Returns the selected item or null if cancelled
   */
  static async selectFromList<T>(
    socket: any,
    session: any,
    title: string,
    items: T[],
    itemRenderer: (item: T, index: number) => string,
    subStateName: string = 'MENU_SELECT'
  ): Promise<T | null> {
    // Store menu state in session
    session.tempData = session.tempData || {};
    session.tempData.menuSelect = {
      title,
      items,
      selectedIndex: 0,
      itemRenderer,
      subStateName
    };

    // Render initial menu
    const menuItems = items.map((item, index) => ({
      label: itemRenderer(item, index),
      action: `select:${index}`
    }));

    const menuState: MenuState = {
      title,
      items: menuItems,
      selectedIndex: 0
    };

    socket.emit('ansi-output', this.renderMenu(menuState));

    // Return null for now - actual selection handled by session handler
    return null;
  }

  /**
   * Render a numbered list with arrow selection
   */
  static renderListSelection(title: string, items: string[], selectedIndex: number, footer?: string): string {
    const menuItems: MenuItem[] = items.map((item, index) => ({
      label: `[${index + 1}] ${item}`,
      action: `select:${index}`
    }));

    return this.renderMenu({
      title,
      items: menuItems,
      selectedIndex,
      footer
    });
  }
}
