export declare function setupKeyboardShortcuts(s: any, cl: any, dc: any, ib: any, sbt: () => string, chl: any, ul: any, ep: any, sh: () => void, ssb: (t: string) => void, asm: (m: string) => void, sfs: () => void, sso: () => void, scon: (t: string, cb: (c: boolean) => void) => void, cu: () => void, SW: number, chatLog?: any, typingBar?: any, menuBar?: any, relayout?: () => void): {
    updateChatLayout: () => void;
    /**
     * Show or hide the sidebar. ONE implementation, because the menu item
     * used to toggle the lists on its own and left the panel standing.
     */
    toggleSidebar: () => boolean;
};
