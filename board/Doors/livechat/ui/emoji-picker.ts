/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */

import { Screen, CategoryPicker } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from './theme';
import type { CategoryItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { getEmojisByCategory, Emoji } from '../utils/emojis';
import { emojiLabel } from '../utils/emoji-label';
import { T } from '../door-theme';

export { Emoji };

/** The slice of the message box the picker needs. */
interface EmojiTarget {
  getValue(): string;
  setValue(value: string): void;
  focus(): void;
}

/**
 * Put one picked emoji into the message box: the `:code:` form, which the
 * send path (replaceEmojis) renders - the one form every entry point shares
 * (button, F4, menu, /emoji) - then hand focus back to the box.
 */
export function insertEmojiIntoInput(
  inputBox: EmojiTarget,
  screen: Pick<Screen, 'render'>,
  emoji: Pick<Emoji, 'code'>,
): void {
  inputBox.setValue(inputBox.getValue() + emoji.code + ' ');
  inputBox.focus();
  screen.render();
}

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

export class EmojiPicker {
  private picker: CategoryPicker;
  private screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;

    /*
     * Fifty-two columns is an eighty-column screen's dialog; a C64 has
     * forty. The picker is an overlay, so it has no neighbour to yield to -
     * it simply hangs off the right edge. Sized from the screen it is the
     * same box at eighty and fits at forty, where the CATEGORY column gives
     * up its width first: the emoji themselves are what the caller reads.
     */
    const screenColumns = Number((screen as any).width) || 80;
    const pickerWidth = Math.min(PICKER_WIDTH, Math.max(20, screenColumns - 2));
    const categoryWidth = Math.min(CATEGORY_WIDTH, Math.max(8, pickerWidth - 24));
    const itemWidth = pickerWidth - categoryWidth - 2 - 1 - 2;

    this.picker = new CategoryPicker({
      parent: screen,
      title: 'Emoji Picker [Tab | Enter]',
      // 52, not 44: the list shows the emoji ART now, not just its
      // shortcode, and both have to fit on one line - a label that wraps
      // pushes every row below it out of line. See PICKER_WIDTH.
      width: pickerWidth,
      height: 14,
      categories: CATEGORIES,
      // categoryWidth was 12 -> 10 chars of content after the box border.
      // List items are ` Category` (8+1 space) plus the `>>` selection
      // marker the List itself prepends to the focused row = 11 chars,
      // which made "Emotions"/"Actions"/"Symbols"/"Special" all wrap to
      // a second line. 14 leaves 12 chars of content, comfortably fitting
      // ` Emotions` + `>>`.
      categoryWidth,
      debounceMs: 80,
      borderColor: PANEL_BORDER,
      zIndex: 9990,
      categoryStyle: {
        fg: T.ink,
        bg: T.ground,
        selected: { fg: T.ground, bg: T.ok },
      },
      itemStyle: {
        fg: T.ink,
        bg: T.ground,
        selected: { fg: T.ground, bg: T.accent },
      },
      getItems: (category: string) => {
        const emojiCategory = CATEGORY_MAP[category] || 'emotions';
        const emojis = getEmojisByCategory(emojiCategory);
        return emojis.map(e => ({
          id: e.code,
          // The ART first - it is the emoji. The shortcode follows so it can
          // still be typed from the keyboard.
          label: emojiLabel(e, itemWidth),
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
      x: Math.max(0, screenWidth - Number(this.picker.width ?? screenWidth)),
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
