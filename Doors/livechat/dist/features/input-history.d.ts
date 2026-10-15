import type { Screen, Textarea } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createInputHistory(s: Screen, ib: Textarea): {
    add: (id: string, text: string) => void;
    getEditingId: () => string | null;
    reset: () => void;
};
