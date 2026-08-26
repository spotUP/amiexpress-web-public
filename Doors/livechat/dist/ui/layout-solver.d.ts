/**
 * Where every panel goes, for any terminal size.
 *
 * The layout used to be plain subtraction - content height is the screen
 * height minus the menu minus the footer, chat width is the screen width
 * minus the sidebar - which is correct only while the screen is big enough
 * for all of it. Resize the browser to an awkward shape and those
 * subtractions go to zero or negative, and a panel handed a negative height
 * does not shrink, it draws over its neighbours. Reported 2026-08-26: "the
 * layout is easy to break by not resizing it aspect correct", and "in many
 * cases the input panel is not drawn" - the chat panel was covering it.
 *
 * So this does not compute sizes, it SOLVES them: the footer and the input
 * are reserved first because a chat you cannot type into is not a chat, the
 * sidebar yields next because it is the optional part, and nothing is ever
 * handed a size below one. Whatever is left over goes to the chat log.
 *
 * Pure, so every shape of window can be checked in a test instead of by
 * dragging a browser corner.
 */
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
    /** Inner log area, inside the chat panel's border. */
    chatLog: {
        width: number;
        height: number;
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
