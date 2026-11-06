import type { Screen, Textarea } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/** `picking` is the message picker's flag: while it owns Up/Down, history stays out. */
export declare function createInputHistory(s: Screen, ib: Textarea, picking?: () => boolean): {
    add: (id: string, text: string) => void;
    /** The server named a sent line: its entry (and an edit in progress) take the server id. */
    rekey: (from: string, to: string) => void;
    getEditingId: () => string | null;
    reset: () => void;
};
