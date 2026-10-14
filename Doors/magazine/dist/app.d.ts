import { type FooterHint } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { MAGAZINE_TITLE, type Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { type MagLayout } from './layout';
interface DoorSession {
    bbs: any;
    /** The board's user: `secLevel` decides who may edit the front page. */
    user?: {
        secLevel?: number;
    } | null;
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
export { MAGAZINE_TITLE };
export declare const HINTS: readonly FooterHint[];
/** Forty columns: only what a caller cannot guess. */
export declare const COMPACT_HINTS: readonly FooterHint[];
/**
 * The sysop's keys, ahead of the reader's own. P is the one that is always
 * there (and survives the fit); the others drop first on a tight line.
 */
export declare function sysopHints(opts: {
    compact: boolean;
    frontView: boolean;
    onFront: boolean;
}): FooterHint[];
export declare const HELP_TEXT: string;
export declare const helpText: (sysop: boolean) => string;
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
    /** The layout now: it changes with the banner each view carries. */
    readonly layout: MagLayout;
    /** The plain text of the banner above the panel now ([] for none). */
    bannerText(): string[];
    /** The plain text of the full-screen art on top of everything ([] when none is up). */
    overlayText(): string[];
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
    /** The text of the wire detail panel when it is open, else ''. */
    modalText(): string;
    /** The kind of view on screen. */
    viewKind(): View['kind'];
    /** What actually ran: sentinels for the tests that prove the effects are wired. */
    stats(): {
        glitches: number;
        tickerSteps: number;
        intervals: number;
        banners: number;
        titles: number;
    };
    stop(): void;
}
export interface ReaderOptions {
    /** Where the shipped placeholder art is; null for none. Default: the door's own art/ directory. */
    shippedArtDir?: string | null;
}
export declare function startReader(session: DoorSession, options?: ReaderOptions): Promise<Reader>;
export declare function createApp(session: DoorSession): Promise<void>;
//# sourceMappingURL=app.d.ts.map