/**
 * Deleting a door from DOORMAN's list: the whole flow, out of app.ts.
 *
 * Split out when app.ts reached the 2000-line ceiling, the same move
 * run-door.ts and installed-footer.ts already made. It earns its own file
 * for a second reason: three separate live reports came out of these ~60
 * lines - a delete that froze the board with no feedback, a delete that said
 * "deleted" over a door still in the list, and a panel that went on
 * describing a deleted door after the list had moved on.
 *
 * What the caller keeps: the confirmation, and the view it draws into.
 * Everything about WHAT a delete does, and what the sysop is told while it
 * happens, is here.
 */
/** Only the fields the delete needs; the view passes its richer object. */
export interface DeletableDoor {
    command: string;
    name: string;
    type: string;
    location?: string;
}
export interface DeleteDoorDeps<T extends DeletableDoor = DeletableDoor> {
    door: T;
    /** where the list's cursor was, so it can land somewhere sensible after */
    selectedIndex: number;
    bbs: any;
    setInfo(text: string): void;
    render(): void;
    setStatus(message: string, colour: 'green' | 'red' | 'yellow', ms?: number): void;
    refreshRegistry(): Promise<unknown>;
    fetchDoors(): Promise<T[]>;
    onDoorsChanged(doors: T[], selectIndex: number): void;
    /** redraw the info panel for whatever door is selected now */
    showSelectedDoor(): void;
}
/**
 * Which identifier the backend should be given.
 *
 * A TypeScript door is asked for by its DIRECTORY, an Amiga door by its
 * command. The backend now prefers whatever is registered either way (see
 * amigaDoorManager.deleteDoor), but passing the name it can actually resolve
 * keeps the log readable.
 */
export declare function deleteIdentifierFor(door: DeletableDoor): {
    id: string;
    isTS: boolean;
};
export declare function performDoorDelete<T extends DeletableDoor>(deps: DeleteDoorDeps<T>): Promise<void>;
//# sourceMappingURL=delete-door-action.d.ts.map