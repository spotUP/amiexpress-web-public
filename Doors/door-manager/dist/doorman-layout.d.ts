/**
 * DOORMAN's shared layout: one set of panels that every view updates in
 * place, and the width rules that decide their shape.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
 *
 * Every width decision here comes from the LIVE screen through the SDK's
 * single compact profile. There is no 40 and no 80 in this file: the door
 * used to build its Screen with no geometry at all and paint an 80-column
 * layout onto whatever canvas the caller had, which is what a C64 saw as a
 * repeated name column and size cells on the wrong rows.
 */
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/** Byte count as a door list shows it. Lives here with the row that uses it. */
export declare function formatSize(bytes: number): string;
/** The shape an installed-door row needs. */
export interface InstalledRowDoor {
    type: string;
    name: string;
    size: number;
    enabled?: boolean;
}
/**
 * Exported for the 40-column layout test: the geometry rules are the thing
 * under test, and constructing the real layout against a real Screen is the
 * only honest way to assert them (a source pin proves a call exists, not
 * that the panels stop overlapping).
 */
export declare class DoormanLayout {
    screen: any;
    header: any;
    footer: any;
    listPanel: any;
    doorList: any;
    infoPanel: any;
    infoBox: any;
    filterPanel: any;
    filterBox: any;
    /** Stops the masthead animation; called when the door tears down. */
    stopMasthead: (() => void) | null;
    readonly width: number;
    /** The SDK's compact profile for THIS screen - the only width authority. */
    readonly compact: ReturnType<typeof getCompactProfile>;
    /** True when the canvas is the 40-column XXS tier (a C64/PETSCII caller). */
    readonly narrow: boolean;
    constructor(screen: any, nodeId: string | number);
    setHeader(content: string): void;
    setFooter(content: string): void;
    setListLabel(label: string): void;
    setListItems(items: string[]): void;
    setListSelect(idx: number): void;
    get listSelected(): number;
    setInfo(content: string): void;
    focusList(): void;
    focusFilter(): void;
    showRepoLayout(): void;
    showInstalledLayout(): void;
    /**
     * One installed-door row: badge, name, enabled flag, size.
     *
     * Here rather than inline in the view because `width` is a layout rule -
     * the row has to be sized by whatever decided the list's text column, and
     * a copy of this arithmetic anywhere else is a copy that can drift from it.
     */
    installedRow(d: InstalledRowDoor): string;
    render(): void;
}
//# sourceMappingURL=doorman-layout.d.ts.map