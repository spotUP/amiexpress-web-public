/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */

import { Screen, CategoryPicker } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { CategoryItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { getEmojisByCategory, Emoji } from '../utils/emojis';

export { Emoji };

const CATEGORY_MAP: Record<string, Emoji['category']> = {
  'Emotions': 'emotions',
  'Actions': 'actions',
  'Symbols': 'symbols',
  'Special': 'special',
};

const CATEGORIES = ['Emotions', 'Actions', 'Symbols', 'Special'];

export class EmojiPicker {
  private picker: CategoryPicker;
  private screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;

    this.picker = new CategoryPicker({
      parent: screen,
      title: 'Emoji Picker [Tab | Enter]',
      width: 42,
      height: 14,
      categories: CATEGORIES,
      categoryWidth: 12,
      debounceMs: 80,
      borderColor: 'cyan',
      categoryStyle: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'green' },
      },
      itemStyle: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'cyan' },
      },
      getItems: (category: string) => {
        const emojiCategory = CATEGORY_MAP[category] || 'emotions';
        const emojis = getEmojisByCategory(emojiCategory);
        return emojis.map(e => ({
          id: e.code,
          label: `${e.code}  ${e.keywords[0] || ''}`,
          emoji: e,  // Store the full emoji object
        }));
      },
      renderItem: (item: CategoryItem) => ` ${item.label}`,
    });
  }

  show(screen: Screen, onSelect: (emoji: Emoji) => void, onCancel: () => void) {
    this.picker.onSelect((item: CategoryItem, category: string) => {
      if (item.emoji) {
        onSelect(item.emoji as Emoji);
      }
    });

    this.picker.onCancel(onCancel);

    // Position near bottom-right
    const screenWidth = (screen as any).width || 80;
    const screenHeight = (screen as any).height || 24;

    this.picker.display({
      x: screenWidth - 44,
      y: screenHeight - 7,
    });
  }

  hide() {
    this.picker.hide();
  }

  isVisible(): boolean {
    return this.picker.isVisible();
  }

  destroy() {
    this.picker.destroy();
  }
}
