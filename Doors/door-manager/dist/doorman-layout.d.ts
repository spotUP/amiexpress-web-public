/**
 * DOORMAN's screen furniture - the header, footer, list, info and filter
 * panels every view draws into, and the animated masthead on the header's
 * first row.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
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
    render(): void;
}
//# sourceMappingURL=doorman-layout.d.ts.map