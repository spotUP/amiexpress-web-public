import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
    };
}
/** One row of the picker. */
export interface PersonaChoice {
    slug: string;
    handle: string;
    name: string;
    blurb: string;
}
/**
 * The two rows that are CHOICES, not characters.
 *
 * `''` is not a persona - it is "whatever the sysop set", which is what every
 * caller has today - and `random` is a stored choice like any other slug that
 * the board rolls when the page is taken. Neither is in the roster the board
 * answers with, so neither can come back from `listCoSysopPersonas()`, and a
 * caller with no row for them could never get back to either.
 */
export declare const BOARD_DEFAULT: PersonaChoice;
export declare const RANDOM_CHOICE: PersonaChoice;
/** The board's default first, the cast in the middle, Random last. */
export declare function rosterFor(personas: PersonaChoice[]): PersonaChoice[];
/**
 * A persona row, styled. Wide keeps the blurb; 40 columns has no room for it.
 *
 * The same numbers as the screen theme picker's rows and for the same
 * reasons: `[*] ` costs four columns, blessed's selected-item caret costs two
 * more, and the last cell is left empty because writing it puts the terminal
 * in a pending-wrap state. A row that folds eats the persona underneath it.
 */
export declare function buildPersonaItems(personas: PersonaChoice[], active: string, s: any, compact: CompactProfile, width?: number): string[];
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