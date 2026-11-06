/** What Enter does with the picked message. */
export type PickAction = 
/** Re-dispatch `/<command> <args> <id>` through the normal command path. */
{
    kind: 'command';
    command: string;
    args: string[];
}
/** Open the per-message context menu (plain Up entry). */
 | {
    kind: 'menu';
};
export interface PickerState {
    active: boolean;
    /** First display row of the selected message. */
    rowIndex: number;
    action: PickAction;
}
/** The message id behind `row`, and the whole run of rows that share it. */
export declare function messageRows(ids: readonly (string | null)[], row: number): {
    first: number;
    last: number;
} | null;
/** First row of the newest message, or null when there is none. */
export declare function newestMessageRow(ids: readonly (string | null)[]): number | null;
/**
 * The first row of the message one step from `row` (dir -1 older, +1 newer),
 * skipping rows without an id and the rest of the current message. Stays put
 * at either end.
 */
export declare function moveSelection(ids: readonly (string | null)[], row: number, dir: -1 | 1): number;
/** Wrapped-row offset of display row `row`, and the height of rows first..last. */
export declare function wrappedSpan(lines: readonly string[], width: number, first: number, last: number): {
    top: number;
    height: number;
};
/**
 * The selected message's line as an inverse bar: the plain text re-wrapped in
 * the given colours and padded to the row width. The caller passes theme
 * tokens (T.ground / T.accent) so no colour is hardcoded here.
 */
export declare function highlightLine(line: string, width: number, fg: string, bg: string): string;
export interface MessagePickerDeps {
    ids: () => readonly (string | null)[];
    /** Selection, label or highlight changed: redraw. */
    onChange: () => void;
    /** Enter on a message. */
    onConfirm: (action: PickAction, messageId: string) => void;
}
export declare function createMessagePicker(deps: MessagePickerDeps): {
    state: PickerState;
    start: (action: PickAction) => boolean;
    /**
     * `/love`, `/react`, `/thumbsup`, `/pin`, `/thread`, `/reply` typed with
     * no message id start pick mode for that action. True when handled.
     */
    startFromCommand: (text: string) => boolean;
    move: (dir: -1 | 1) => void;
    confirm: () => void;
    cancel: () => void;
};
export type MessagePicker = ReturnType<typeof createMessagePicker>;
