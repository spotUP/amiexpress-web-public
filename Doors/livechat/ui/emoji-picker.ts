/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */

import { Screen, CategoryPicker } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from './theme';
import type { CategoryItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { getEmojisByCategory, Emoji } from '../utils/emojis';
import { emojiLabel } from '../utils/emoji-label';

export { Emoji };

const CATEGORY_MAP: Record<string, Emoji['category']> = {
  'Emotions': 'emotions',
  'Actions': 'actions',
  'Symbols': 'symbols',
  'Special': 'special',
};

const CATEGORIES = ['Emotions', 'Actions', 'Symbols', 'Special'];

const PICKER_WIDTH = 52;
const CATEGORY_WIDTH = 14;

/**
 * Room a label actually gets: the box minus the category column, minus the
 * two border columns, the leading space renderItem adds and the `>>` marker
 * the List prepends to the focused row.
 */
const ITEM_WIDTH = PICKER_WIDTH - CATEGORY_WIDTH - 2 - 1 - 2;

export class EmojiPicker {
  private picker: CategoryPicker;
  private screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;

    this.picker = new CategoryPicker({
      parent: screen,
      title: 'Emoji Picker [Tab | Enter]',
      // 52, not 44: the list shows the emoji ART now, not just its
      // shortcode, and both have to fit on one line - a label that wraps
      // pushes every row below it out of line. See PICKER_WIDTH.
      width: PICKER_WIDTH,
      height: 14,
      categories: CATEGORIES,
      // categoryWidth was 12 -> 10 chars of content after the box border.
      // List items are ` Category` (8+1 space) plus the `>>` selection
      // marker the List itself prepends to the focused row = 11 chars,
      // which made "Emotions"/"Actions"/"Symbols"/"Special" all wrap to
      // a second line. 14 leaves 12 chars of content, comfortably fitting
      // ` Emotions` + `>>`.
      categoryWidth: CATEGORY_WIDTH,
      debounceMs: 80,
      borderColor: PANEL_BORDER,
      zIndex: 9990,
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
          // The ART first - it is the emoji. The shortcode follows so it can
          // still be typed from the keyboard.
          label: emojiLabel(e, ITEM_WIDTH),
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
      x: screenWidth - PICKER_WIDTH,
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
