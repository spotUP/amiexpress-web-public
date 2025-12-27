/**
 * Emoji Picker Dialog
 * Three-panel interface: Categories | Emojis | Preview
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { EMOJIS, getEmojisByCategory, getCategories, Emoji } from '../utils/emojis';

export class EmojiPicker {
  private overlay: any;
  private categoryList: any;
  private emojiList: any;
  private previewBox: any;
  private currentCategory: Emoji['category'] = 'emotions';
  private onSelect: ((emoji: Emoji) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(screen: any) {
    // Create overlay container
    this.overlay = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 20,
      label: ' Emoji Picker [Tab: Switch | Enter: Select | ESC: Close] ',
      border: { type: 'line' },
      shadow: true,
      hidden: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
    });

    // Category list (left panel)
    this.categoryList = blessed.list({
      parent: this.overlay,
      top: 0,
      left: 0,
      width: 15,
      height: '100%-2',
      label: ' Category ',
      border: { type: 'line' },
      mouse: true,
      vi: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'green' },
        selected: { fg: 'black', bg: 'green' },
      },
      items: ['Emotions', 'Actions', 'Symbols', 'Special'],
    });

    // Emoji list (center panel)
    this.emojiList = blessed.list({
      parent: this.overlay,
      top: 0,
      left: 15,
      width: 25,
      height: '100%-2',
      label: ' Emojis ',
      border: { type: 'line' },
      mouse: true,
      vi: true,
      keys: true,
      scrollbar: {
        ch: ' ',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        selected: { fg: 'black', bg: 'cyan' },
      },
    });

    // Preview box (right panel)
    this.previewBox = blessed.box({
      parent: this.overlay,
      top: 0,
      left: 40,
      width: 20,
      height: '100%-2',
      label: ' Preview ',
      border: { type: 'line' },
      content: '',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
      },
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

    // Emoji selection
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

    // Emoji hover for preview
    this.emojiList.on('select item', (item: any, index: number) => {
      const emojis = getEmojisByCategory(this.currentCategory);
      if (emojis[index]) {
        this.updatePreview(emojis[index]);
      }
    });

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
      const selected = (this.emojiList as any).selected;
      const emojis = getEmojisByCategory(this.currentCategory);
      if (selected !== undefined && emojis[selected]) {
        this.updatePreview(emojis[selected]);
      }
      this.overlay.screen.render();
    });

    this.emojiList.key(['down', 'j'], () => {
      this.emojiList.down(1);
      const selected = (this.emojiList as any).selected;
      const emojis = getEmojisByCategory(this.currentCategory);
      if (selected !== undefined && emojis[selected]) {
        this.updatePreview(emojis[selected]);
      }
      this.overlay.screen.render();
    });
  }

  private loadCategory(category: Emoji['category']) {
    const emojis = getEmojisByCategory(category);
    const items = emojis.map(e => `${e.display}  ${e.code}`);
    this.emojiList.setItems(items);
    if (emojis.length > 0) {
      this.updatePreview(emojis[0]);
    }
    this.overlay.screen.render();
  }

  private updatePreview(emoji: Emoji) {
    const content = [
      '',
      `{center}{bold}${emoji.display}{/bold}{/center}`,
      '',
      `{cyan-fg}Code:{/cyan-fg}`,
      `${emoji.code}`,
      '',
      `{cyan-fg}Keywords:{/cyan-fg}`,
      emoji.keywords.join(', '),
      '',
    ].join('\n');

    this.previewBox.setContent(content);
    this.overlay.screen.render();
  }

  show(screen: any, onSelect: (emoji: Emoji) => void, onCancel: () => void) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this.overlay.show();
    this.categoryList.focus();
    screen.render();
  }

  hide() {
    this.overlay.hide();
    this.overlay.screen.render();
  }

  isVisible(): boolean {
    return !this.overlay.hidden;
  }

  destroy() {
    this.overlay.destroy();
  }
}
