/**
 * Emoji Picker Dialog
 * Three-panel interface: Categories | Emojis | Preview
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen, Box, List, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { EMOJIS, getEmojisByCategory, getCategories, Emoji } from '../utils/emojis';

export class EmojiPicker {
  private modalBackground: Box;
  private overlay: Box;
  private closeButton: Button;
  private categoryList: List;
  private emojiList: List;
  private currentCategory: Emoji['category'] = 'emotions';
  private onSelect: ((emoji: Emoji) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(screen: Screen) {
    // Create overlay container - positioned near bottom-right
    const screenWidth = (screen as any).width || 80;
    const screenHeight = (screen as any).height || 24;

    // Modal background - clicking it closes the dialog
    this.modalBackground = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      hidden: true,
      clickable: true,
      mouse: true,
      style: {
        bg: 'black',
        transparent: true,
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 999,
    });

    // Close dialog when clicking background
    this.modalBackground.on('click', () => {
      this.hide();
    });

    this.overlay = createBox({
      parent: screen,
      bottom: 5,  // Above status bar and input
      right: 2,   // Position from right edge (more reliable than calculating left)
      width: 40,  // Compact width for 2 panels only
      height: 18,  // Compact height
      label: ' Emoji Picker [Tab | Enter] ',
      border: { type: 'line', fg: 'cyan' },
      shadow: true,
      hidden: true,
      mouse: true,
      keys: true,
      clickable: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 1000,
    });

    // Close button [X] in top-right corner - use blessed.box for borderless button
    this.closeButton = blessed.box({
      parent: this.overlay,
      top: 0,
      right: 1,
      width: 3,
      height: 1,
      content: '[X]',
      mouse: true,
      clickable: true,
      style: {
        fg: 'red',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'red'
        }
      },
    }) as unknown as Button;

    // Close on button click
    this.closeButton.on('click', () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });

    // Category list (left panel)
    // Height: overlay is 18, minus 2 for border, minus 1 for close button row = 15
    this.categoryList = createList({
      parent: this.overlay,
      top: 1,  // Below close button row
      left: 0,
      width: 12,
      height: 15,  // Explicit height (18 - 2 border - 1 close row)
      label: ' Category ',
      border: { type: 'line', fg: 'green' },
      mouse: true,
      vi: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'green' },
        item: {
          hover: { fg: 'black', bg: 'green' },
        },
      } as any,
      items: ['Emotions', 'Actions', 'Symbols', 'Special'],
    });

    // Emoji list (right panel - full width)
    this.emojiList = createList({
      parent: this.overlay,
      top: 1,  // Below close button row
      left: 12,
      width: 26,  // Adjusted width
      height: 15,  // Explicit height (18 - 2 border - 1 close row)
      label: ' Emojis ',
      border: { type: 'line', fg: 'cyan' },
      mouse: true,
      vi: true,
      keys: true,
      clickable: true,
      interactive: true,
      scrollbar: {
        ch: ' ',
      },
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'cyan' },
        item: {
          hover: { fg: 'black', bg: 'cyan' },
        },
      } as any,
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Load initial category
    this.loadCategory('emotions');
  }

  private setupEventHandlers() {
    // Category selection
    this.categoryList.on('select', (item: any) => {
      const categoryName = typeof item === 'string' ? item : item.content;
      const categoryMap: Record<string, Emoji['category']> = {
        'Emotions': 'emotions',
        'Actions': 'actions',
        'Symbols': 'symbols',
        'Special': 'special',
      };
      this.currentCategory = categoryMap[categoryName] || 'emotions';
      this.loadCategory(this.currentCategory);
      this.emojiList.focus();
    });

    // Emoji selection (on Enter key or click)
    this.emojiList.on('select', () => {
      const selected = (this.emojiList as any).selected;
      const emojis = getEmojisByCategory(this.currentCategory);
      if (selected !== undefined && emojis[selected]) {
        const emoji = emojis[selected];
        if (this.onSelect) {
          this.onSelect(emoji);
        }
        this.hide();
      }
    });

    // Also handle Enter key explicitly
    this.emojiList.key(['enter', 'return'], () => {
      const selected = (this.emojiList as any).selected;
      const emojis = getEmojisByCategory(this.currentCategory);
      if (selected !== undefined && emojis[selected]) {
        const emoji = emojis[selected];
        if (this.onSelect) {
          this.onSelect(emoji);
        }
        this.hide();
      }
    });

    // Emoji hover - no preview needed

    // Tab to switch focus
    this.overlay.key(['tab'], () => {
      if (this.categoryList.focused) {
        this.emojiList.focus();
      } else {
        this.categoryList.focus();
      }
      this.overlay.screen.render();
    });

    // ESC to close
    this.overlay.key(['escape'], () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });

    // Arrow keys for navigation
    this.categoryList.key(['up', 'k'], () => {
      this.categoryList.up(1);
      this.overlay.screen.render();
    });

    this.categoryList.key(['down', 'j'], () => {
      this.categoryList.down(1);
      this.overlay.screen.render();
    });

    this.emojiList.key(['up', 'k'], () => {
      this.emojiList.up(1);
      this.overlay.screen.render();
    });

    this.emojiList.key(['down', 'j'], () => {
      this.emojiList.down(1);
      this.overlay.screen.render();
    });
  }

  private loadCategory(category: Emoji['category']) {
    const emojis = getEmojisByCategory(category);
    // Show only ASCII codes, no Unicode emoji characters
    const items = emojis.map(e => `${e.code}  ${e.keywords[0] || ''}`);
    this.emojiList.setItems(items);
    this.overlay.screen.render();
  }

  show(screen: any, onSelect: (emoji: Emoji) => void, onCancel: () => void) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this.modalBackground.show();  // Show background first
    this.overlay.show();
    this.emojiList.focus();  // Focus emoji list directly for immediate selection
    this.emojiList.select(0);  // Select first emoji
    screen.render();
  }

  hide() {
    this.modalBackground.hide();
    this.overlay.hide();
    this.overlay.screen.render();
  }

  isVisible(): boolean {
    return !this.overlay.hidden;
  }

  destroy() {
    this.modalBackground.destroy();
    this.closeButton.destroy();
    this.overlay.destroy();
  }
}
