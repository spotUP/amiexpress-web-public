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
/** Render typing preview content - shows other users typing in real-time */
export declare function renderTypingPreview(buffers: Map<number, TypingBuffer>): string;
/** Process keystroke for typing buffer */
export declare function processKeystroke(buffers: Map<number, TypingBuffer>, userId: number, username: string, char: string, userColor: string): void;
