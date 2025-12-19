import type { Widgets } from 'neo-blessed';
import { EMOJI_CATEGORIES, getEmojisByCategory, getAllEmojiCodes, formatEmojiDisplay, type Emoji } from '../utils/emojis';

/** Emoji picker dialog */
export class EmojiPicker {
  private overlay: Widgets.BoxElement;
  private categoryList: Widgets.ListElement;
  private emojiList: Widgets.ListElement;
  private preview: Widgets.BoxElement;
  private helpText: Widgets.BoxElement;
  private currentCategory = 0;
  private onSelect?: (emoji: Emoji) => void;
  private onCancel?: () => void;

  constructor(screen: Widgets.Screen) {
    // Semi-transparent overlay
    this.overlay = screen.createBox({
      parent: screen,
      left: 'center',
      top: 'center',
      width: 70,
      height: 20,
      border: { type: 'line' },
      style: {
        bg: 'black',
        fg: 'white',
        border: { fg: 'cyan' }
      },
      label: ' {cyan-fg}Emoji Picker{/cyan-fg} ',
      tags: true,
      hidden: true,
      shadow: true
    });

    // Category list (left side)
    this.categoryList = screen.createList({
      parent: this.overlay,
      left: 1,
      top: 1,
      width: 14,
      height: 14,
      border: { type: 'line' },
      style: {
        bg: 'black',
        fg: 'white',
        border: { fg: 'blue' },
        selected: { bg: 'blue', fg: 'white' }
      },
      label: ' Category ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      items: EMOJI_CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
      scrollbar: {
        ch: '│',
        style: { fg: 'blue' }
      }
    });

    // Emoji list (center)
    this.emojiList = screen.createList({
      parent: this.overlay,
      left: 16,
      top: 1,
      width: 38,
      height: 14,
      border: { type: 'line' },
      style: {
        bg: 'black',
        fg: 'white',
        border: { fg: 'green' },
        selected: { bg: 'green', fg: 'white' }
      },
      label: ' Emojis ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '│',
        style: { fg: 'green' }
      }
    });

    // Preview box (right side)
    this.preview = screen.createBox({
      parent: this.overlay,
      left: 55,
      top: 1,
      width: 13,
      height: 14,
      border: { type: 'line' },
      style: {
        bg: 'black',
        fg: 'cyan',
        border: { fg: 'yellow' }
      },
      label: ' Preview ',
      tags: true,
      align: 'center',
      valign: 'middle'
    });

    // Help text
    this.helpText = screen.createBox({
      parent: this.overlay,
      left: 1,
      top: 16,
      width: 68,
      height: 2,
      content: '{gray-fg}↑↓: Navigate | ←→/Tab: Switch pane | Enter: Select | Esc: Cancel{/}',
      tags: true,
      style: { fg: 'gray' }
    });

    // Event handlers
    this.setupEventHandlers(screen);
  }

  private setupEventHandlers(screen: Widgets.Screen): void {
    // Category selection changes emoji list
    this.categoryList.on('select', (item, index) => {
      this.currentCategory = index;
      this.updateEmojiList();
    });

    // Emoji selection updates preview
    this.emojiList.on('select', (item, index) => {
      this.updatePreview(index);
    });

    // Enter on emoji list = select
    this.emojiList.key(['enter'], () => {
      const index = (this.emojiList as any).selected || 0;
      const category = EMOJI_CATEGORIES[this.currentCategory];
      const emojis = getEmojisByCategory(category);
      if (emojis[index]) {
        this.onSelect?.(emojis[index]);
        this.hide(screen);
      }
    });

    // Tab / Arrow keys switch between panes
    this.categoryList.key(['tab', 'right'], () => {
      this.emojiList.focus();
      screen.render();
    });

    this.emojiList.key(['tab'], () => {
      this.categoryList.focus();
      screen.render();
    });

    this.emojiList.key(['left'], () => {
      this.categoryList.focus();
      screen.render();
    });

    // Escape closes picker
    const escapeHandler = () => {
      this.onCancel?.();
      this.hide(screen);
    };

    this.overlay.key(['escape', 'q'], escapeHandler);
    this.categoryList.key(['escape', 'q'], escapeHandler);
    this.emojiList.key(['escape', 'q'], escapeHandler);

    // Click on emoji = select
    this.emojiList.on('click', () => {
      const index = (this.emojiList as any).selected || 0;
      const category = EMOJI_CATEGORIES[this.currentCategory];
      const emojis = getEmojisByCategory(category);
      if (emojis[index]) {
        this.onSelect?.(emojis[index]);
        this.hide(screen);
      }
    });
  }

  private updateEmojiList(): void {
    const category = EMOJI_CATEGORIES[this.currentCategory];
    const emojis = getEmojisByCategory(category);
    const items = emojis.map(formatEmojiDisplay);
    this.emojiList.setItems(items);
    (this.emojiList as any).select(0);
    this.updatePreview(0);
  }

  private updatePreview(index: number): void {
    const category = EMOJI_CATEGORIES[this.currentCategory];
    const emojis = getEmojisByCategory(category);
    const emoji = emojis[index];

    if (emoji) {
      this.preview.setContent(`\n{yellow-fg}${emoji.ascii}{/}\n\n{gray-fg}${emoji.keywords.join(', ')}{/}`);
    } else {
      this.preview.setContent('');
    }
  }

  show(screen: Widgets.Screen, onSelect: (emoji: Emoji) => void, onCancel?: () => void): void {
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    // Reset to first category
    this.currentCategory = 0;
    (this.categoryList as any).select(0);
    this.updateEmojiList();

    // Show and focus
    this.overlay.show();
    this.categoryList.focus();
    screen.render();
  }

  hide(screen: Widgets.Screen): void {
    this.overlay.hide();
    screen.render();
  }

  isVisible(): boolean {
    return !(this.overlay as any).hidden;
  }
}

/** Create emoji autocomplete list for input */
export function createEmojiAutocomplete(screen: Widgets.Screen, parent: Widgets.Node): Widgets.ListElement {
  return screen.createList({
    parent,
    left: 0,
    bottom: 1,
    width: 30,
    height: 8,
    border: { type: 'line' },
    style: {
      bg: 'black',
      fg: 'white',
      border: { fg: 'cyan' },
      selected: { bg: 'cyan', fg: 'black' }
    },
    label: ' Emojis ',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    hidden: true,
    scrollbar: {
      ch: '│',
      style: { fg: 'cyan' }
    }
  });
}

/** Show emoji autocomplete for partial input */
export function showEmojiAutocomplete(
  list: Widgets.ListElement,
  screen: Widgets.Screen,
  partial: string
): boolean {
  if (!partial.startsWith(':') || partial.length < 2) {
    list.hide();
    screen.render();
    return false;
  }

  const query = partial.slice(1); // Remove leading :
  const matches = getAllEmojiCodes().filter(code =>
    code.toLowerCase().includes(query.toLowerCase())
  );

  if (matches.length === 0) {
    list.hide();
    screen.render();
    return false;
  }

  list.setItems(matches.slice(0, 10));
  list.show();
  screen.render();
  return true;
}
