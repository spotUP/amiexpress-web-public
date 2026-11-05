import type { AppState } from './state';
/** Key handler result */
export interface KeyResult {
    type: 'char' | 'backspace' | 'enter' | 'escape' | 'tab' | 'arrow' | 'ignore';
    char?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
}
/** Parse raw key input */
export declare function parseKey(data: string): KeyResult;
/** Handle key input and update state */
export declare function handleKey(state: AppState, key: KeyResult): string | null;
