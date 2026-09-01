/**
 * FileExplorerOverlay - full-screen file browser + viewer
 * Spot / Up Rough
 */
interface FileExplorerOptions {
    screen: any;
    doorPath: string;
    onClose: () => void;
    /**
     * What a relative door path is relative TO. Defaults to the BBS root, the
     * way the rest of DOORMAN finds it; a test passes its own.
     */
    bbsRoot?: string;
}
/**
 * What a door's path means, from the BBS root.
 *
 * A door's LOCATION is relative to the BBS root - `Doors/<door>` - and an
 * absolute one is already an answer. This used to resolve against
 * `process.cwd()`, which on the board is /app/web/backend: a tree with no
 * Doors directory in it, so the explorer opened on nothing for every door
 * whose registration carries a relative path.
 */
export declare function doorPathFrom(bbsRoot: string, doorPath: string): string;
export declare class FileExplorerOverlay {
    private screen;
    private onClose;
    private projectRoot;
    private doorRoot;
    private currentDir;
    private overlay;
    private header;
    private footer;
    private listWidget;
    private viewerBox;
    private _keypressHandler;
    private viewerState;
    private viewerScrollOffset;
    private viewerLines;
    private viewerTotalLines;
    private viewerFilename;
    private isGuide;
    private guideParser;
    private guideNodeHistory;
    private guideCurrentNode;
    private guideLinks;
    constructor(opts: FileExplorerOptions);
    private buildUI;
    private loadDirectory;
    private handleSelect;
    private openFile;
    private getViewerHeight;
    private openGuide;
    private renderGuideNode;
    private renderViewer;
    private refreshViewer;
    private backFromViewer;
    private updateHeader;
    private updateFooterBrowser;
    private updateFooterViewer;
    private getSelectedFilename;
    private deleteSelected;
    private renameSelected;
    private _promptHandler;
    private promptInFooter;
    private restoreFooter;
    private showFooterMsg;
    private close;
}
export {};
//# sourceMappingURL=FileExplorerOverlay.d.ts.map