/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Emoji } from '../utils/emojis';
export { Emoji };
/**
 * Room a label actually gets: the box minus the category column, minus the
 * two border columns, the leading space renderItem adds and the `>>` marker
 * the List prepends to the focused row.
 */
export declare class EmojiPicker {
    private picker;
    private screen;
    constructor(screen: Screen);
    show(screen: Screen, onSelect: (emoji: Emoji) => void, onCancel: () => void): void;
    hide(): void;
    isVisible(): boolean;
    destroy(): void;
}
