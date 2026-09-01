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
/**
 * Where the backend's AmigaGuide parser might be, in the order to try.
 *
 * This one IS relative to the working directory - the backend is what cwd
 * points at (Dockerfile WORKDIR /app/web/backend), the same way
 * livechat/chat-only-login.ts reaches the backend's database. What was wrong
 * was the path from there: `web/backend/dist/amigaguide/AmigaGuideParser`
 * assumed a compiled backend one directory tree further down, and the board
 * runs the backend from SOURCE under tsx - there is no dist/ at all. Every
 * .guide opened as plain text, silently, because the require sat in a catch.
 */
export declare function guideParserCandidates(cwd?: string): string[];
/** The first candidate that loads, or null - a guide then opens as text. */
export declare function loadGuideParser(cwd?: string): any;
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