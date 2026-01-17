/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Emoji } from '../utils/emojis';
export { Emoji };
export declare class EmojiPicker {
    private picker;
    private screen;
    constructor(screen: Screen);
    show(screen: Screen, onSelect: (emoji: Emoji) => void, onCancel: () => void): void;
    hide(): void;
    isVisible(): boolean;
    destroy(): void;
}
