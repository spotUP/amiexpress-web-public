import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
    };
}
/** One row of the picker: a screen theme, or the board's own art. */
export interface ScreenThemeChoice {
    slug: string;
    title: string;
    author: string;
    widths: number[];
    status: string;
}
/**
 * The board's own art, always offered and never in the registry as a
 * directory.
 *
 * `default` is not a theme directory - it IS the board's screens, where they
 * are today - so a caller who wants back out of a theme has to have a row to
 * choose. Without it the only way off a theme was for a sysop to retire it.
 */
export declare const BOARD_ART: ScreenThemeChoice;
/**
 * The themes worth offering THIS caller, at the width they are actually on.
 *
 * `WIDTHS` is the artist's own declaration, and a theme that says it is 80
 * only has nothing for a C64 caller but the board's art with extra steps. A
 * theme that declares NOTHING is offered at every width: an empty declaration
 * is a theme that has not said, not a theme that has said no.
 */
export declare function choicesForWidth(themes: ScreenThemeChoice[], width: number): ScreenThemeChoice[];
/**
 * A theme row, styled. Wide keeps the artist's name; 40 columns has no room.
 *
 * The same shape THEME uses, and the same reason for every number in it:
 * `[*] ` costs four columns, blessed's selected-item caret costs two more, and
 * the last cell is left empty because writing it puts the terminal in a
 * pending-wrap state. A row that folds eats the theme underneath it.
 */
export declare function buildThemeItems(themes: ScreenThemeChoice[], active: string, s: any, compact: CompactProfile, width?: number): string[];
/** The line under the list, said in as many words as the screen has room for. */
export declare function buildNote(s: any, compact: CompactProfile): string;
/** Footer key hints; the 40-column set is the same three keys, abbreviated. */
export declare function buildFooterHints(compact: CompactProfile): Array<{
    key: string;
    does: string;
}>;
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map