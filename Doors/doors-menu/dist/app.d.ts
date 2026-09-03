/**
 * Doors Menu - Interactive Door Selection with Categories
 *
 * Displays available doors organized by category with arrow key navigation.
 * Uses SDK blessed helpers (no duplicate code).
 */
import { type FooterHint } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
/** One category row: icon, name, and the door count. */
export declare function buildCategoryRow(catName: string, doorCount: number, hasSubcats: boolean, s: any, width: number): string;
/** One door row: type badge, command, name and (wide only) the size. */
export declare function buildDoorRow(door: {
    type: string;
    command: string;
    name: string;
    size?: number;
}, s: any, width: number): string;
/** The hints this door offers, at the width tier it is drawn at. */
export declare const FOOTER_HINTS: readonly FooterHint[];
/** The same hints, shortened for the 40-column tier. */
export declare const FOOTER_HINTS_COMPACT: readonly FooterHint[];
/**
 * The footer hint line.
 *
 * Was a door-local join of `${s.key(...)} ${s.dim(...)}` strings - a second
 * copy of the SDK's footerHints, which is the drift this whole pass exists
 * to end. Byte-identical output; one implementation.
 *
 * Kept exported because the 40-column test drives it directly.
 */
export declare function buildFooterContent(s: any, width: number): string;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map