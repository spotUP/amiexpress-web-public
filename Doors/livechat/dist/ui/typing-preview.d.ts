import type { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare const TYPING_HEIGHT = 3;
/** Typing buffer for a user */
export interface TypingBuffer {
    username: string;
    buffer: string;
    lastUpdate: number;
    color: string;
}
/** Create typing preview component */
export declare function createTypingPreview(screen: Screen): Box;
/**
 * How long a typing buffer stands after its owner's last keystroke.
 *
 * A buffer is only removed when its owner sends the line or clears it, so
 * somebody who types two characters and walks away would otherwise count as
 * typing for the rest of the session.
 */
export declare const TYPING_STALE_MS = 5000;
/**
 * True while anyone - the caller or another node - is mid-keystroke.
 *
 * The preview reads this per buffer to decide what to draw; the theme
 * chrome reads it for the whole room, because a glitch is a lie written
 * over the chat log and every keystroke rebuilds that log's content. Both
 * answer the question from the same buffers and the same staleness.
 */
export declare function isAnyoneTyping(buffers: Map<number, TypingBuffer>, now?: number): boolean;
/** Render typing preview content - shows other users typing in real-time */
export declare function renderTypingPreview(buffers: Map<number, TypingBuffer>): string;
/** Process keystroke for typing buffer */
export declare function processKeystroke(buffers: Map<number, TypingBuffer>, userId: number, username: string, char: string, userColor: string): void;
