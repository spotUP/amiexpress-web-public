import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
    };
}
/** A theme row, styled. Wide keeps the blurb column; XXS has no room for it. */
export declare function buildThemeItems(themes: Array<{
    id: string;
    name: string;
    blurb: string;
}>, active: string, s: any, compact: CompactProfile, width?: number): string[];
/** The line under the list, said in as many words as the screen has room for. */
export declare function buildNote(s: any, compact: CompactProfile): string;
/** Footer key hints; the XXS set is the same three keys, abbreviated to fit. */
export declare function buildFooterHints(compact: CompactProfile): Array<{
    key: string;
    does: string;
}>;
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map