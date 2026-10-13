import { type FooterHint } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { type Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { type MagLayout } from './layout';
interface DoorSession {
    bbs: any;
    bbsSession?: {
        doorCommand?: string;
    };
    storage: {
        load<T>(key: string): Promise<T | null>;
        save(key: string, data: any): Promise<void>;
    };
}
export declare const READ_KEY = "read-story-ids";
export declare const BOOKMARK_KEY = "bookmark-story-ids";
export declare const MAGAZINE_TITLE = "UNDERGROUND MAG";
export declare const HINTS: readonly FooterHint[];
/** Forty columns: only what a caller cannot guess. */
export declare const COMPACT_HINTS: readonly FooterHint[];
export declare const HELP_TEXT: string;
type View = {
    kind: 'front';
} | {
    kind: 'contents';
    desk: Desk | null;
} | {
    kind: 'bookmarks';
} | {
    kind: 'article';
    storyId: string;
    list: string[];
    back: View;
};
export interface Reader {
    screen: any;
    layout: MagLayout;
    /** Resolves when the caller leaves. */
    done: Promise<void>;
    /** Feed a key as the terminal would: `press('down')`, `press('c', 'c')`. */
    press(name: string, ch?: string): void;
    /** The plain text of the panel rows on screen now. */
    panelRows(): string[];
    /** The plain text of the progress row. */
    progressRow(): string;
    /** The plain text of the footer row (hints and status), tags stripped. */
    footerRow(): string;
    /** The plain text of the news wire row now, tags stripped ('' when the sysop turned it off). */
    tickerRow(): string;
    /** The kind of view on screen. */
    viewKind(): View['kind'];
    /** What actually ran: sentinels for the tests that prove the effects are wired. */
    stats(): {
        glitches: number;
        tickerSteps: number;
        intervals: number;
    };
    stop(): void;
}
export declare function startReader(session: DoorSession): Promise<Reader>;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map