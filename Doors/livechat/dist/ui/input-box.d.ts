/**
 * Input box component
 * Text input for chat messages with emoji button
 */
import { Screen, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare const INPUT_HEIGHT = 3;
export declare const EMOJI_BUTTON_WIDTH = 6;
export declare function createInputBox(screen: Screen): import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Textarea;
export declare function createEmojiButton(screen: Screen): Button;
