/**
 * Doors Menu - Interactive Door Selection with Categories
 *
 * Displays available doors organized by category with arrow key navigation.
 * Uses SDK blessed helpers (no duplicate code).
 */
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
/** The footer hint line. XXS keeps the navigation keys and drops the rest. */
export declare function buildFooterContent(s: any, width: number): string;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map