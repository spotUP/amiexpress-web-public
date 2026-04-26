/**
 * FileExplorerOverlay — full-screen file browser + viewer
 * Spot / Up Rough
 */
interface FileExplorerOptions {
    screen: any;
    doorPath: string;
    onClose: () => void;
}
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
    private close;
}
export {};
//# sourceMappingURL=FileExplorerOverlay.d.ts.map