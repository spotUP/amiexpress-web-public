/**
 * InfoEditorOverlay - edit door registration .info (BBSCmd) files
 * Spot / Up Rough
 */
interface InfoEditorOptions {
    screen: any;
    command: string;
    bbs: any;
    onClose: () => void;
}
export declare class InfoEditorOverlay {
    private screen;
    private command;
    private bbs;
    private onClose;
    private overlay;
    private header;
    private footer;
    private listWidget;
    private tooltypes;
    private dirty;
    private closed;
    private infoPath;
    private blockNextSelect;
    private activeEditHandler;
    constructor(opts: InfoEditorOptions);
    private buildUI;
    private loadInfo;
    private renderList;
    private editSelected;
    private toggleComment;
    private save;
    private updateFooter;
    private close;
}
export {};
//# sourceMappingURL=InfoEditorOverlay.d.ts.map