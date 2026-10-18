export interface LayoutConstants {
    menuHeight: number;
    statusHeight: number;
    inputHeight: number;
    emojiButtonWidth: number;
}
export interface LayoutRequest {
    width: number;
    height: number;
    /** Whether the user wants the sidebar at all. */
    sidebarVisible: boolean;
    sidebarWidth: number;
    sidebarDock: string;
}
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}
export interface SolvedLayout {
    /** Rows between the menu bar and the footer. Never below one. */
    contentHeight: number;
    /** Null when there is no room for it, whatever the user asked for. */
    sidebar: Rect | null;
    chat: Rect;
    /**
     * Inner log width, inside the chat panel's border. The height is the
     * panel's: the log fills whatever rows the panel gives its content, which
     * on a movable panel excludes the title bar row.
     */
    chatLog: {
        width: number;
    };
    input: {
        width: number;
        height: number;
    };
    /** Zero when the window is too short to afford them. */
    statusHeight: number;
    menuHeight: number;
    emojiButton: {
        left: number;
        visible: boolean;
    };
    statusBar: {
        width: number;
    };
    /** Chat panel columns below which the sidebar is dropped. */
    usable: boolean;
    /**
     * True when the sidebar owns the whole screen and the chat is not drawn.
     *
     * Only a C64 reaches this. At forty columns a docked sidebar leaves the
     * chat twenty-one columns of text, which is not a narrow chat window, it
     * is an unreadable one - so the two stop sharing the row: either the chat
     * has the screen, or the lists do.
     */
    chatHidden: boolean;
}
/**
 * Narrowest chat panel worth keeping.
 *
 * Below this the sidebar goes, because a two-column chat log is not a
 * degraded chat window, it is a broken one.
 */
export declare const MIN_CHAT_WIDTH = 24;
/** Narrowest sidebar worth showing; thinner than this and it is noise. */
export declare const MIN_SIDEBAR_WIDTH = 8;
/** The layout is not usable below this - everything still gets valid geometry. */
export declare const MIN_USABLE_WIDTH = 20;
export declare const MIN_USABLE_HEIGHT = 6;
export declare function solveLayout(request: LayoutRequest, constants: LayoutConstants): SolvedLayout;
