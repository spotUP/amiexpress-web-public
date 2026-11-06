/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Emoji } from '../utils/emojis';
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
export declare function insertEmojiIntoInput(inputBox: EmojiTarget, screen: Pick<Screen, 'render'>, emoji: Pick<Emoji, 'code'>): void;
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
