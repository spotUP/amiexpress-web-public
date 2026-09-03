import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type DoorChrome } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
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
    /** The masthead, its rail and the theme's glitches; stopped at teardown. */
    chrome: DoorChrome | null;
    /**
     * Kept as a field name the door already calls: teardown says
     * `stopMasthead()`, and there is no reason to make every call site learn
     * a new one for the same act.
     */
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