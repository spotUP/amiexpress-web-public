/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
import { Screen, MenuBar as SDKMenuBar, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare const MENU_HEIGHT = 1;
/**
 * The headline beside the rail. Full words: this is a label, not a code.
 */
export declare const MASTHEAD_TITLE = "LIVE CHAT";
export interface MenuBarHandlers {
    onHelp?: () => void;
    onList?: () => void;
    onChTab?: () => void;
    onJoinChannel?: () => void;
    onLeaveChannel?: () => void;
    onEmoji?: () => void;
    onFiles?: () => void;
    onPins?: () => void;
    onSearch?: () => void;
    onThreads?: () => void;
    onSettings?: () => void;
    onTheme?: () => void;
    onRenderMode?: () => void;
    onToggleView?: () => void;
    onToggleSidebar?: () => void;
    onClearChat?: () => void;
    onAbout?: () => void;
    onShortcuts?: () => void;
    onQuit?: () => void;
}
export interface MenuBar {
    element: SDKMenuBar;
    setHandlers: (handlers: MenuBarHandlers) => void;
    /**
     * The run of the bar the menus leave, for the theme's masthead.
     *
     * Row 0 is this bar and every row under it is a panel, so the door has no
     * spare row to give a masthead - the same constraint CARD LOBBY has, and
     * the same answer: the bar's own row, from the column after the last
     * label to the right edge.
     */
    mastheadRow: Box;
    /** Size the run to the LIVE screen; returns whether a masthead fits. */
    layoutMasthead: () => boolean;
    /** Columns the run may use, from the last layoutMasthead(). */
    mastheadWidth: () => number;
}
/**
 * The column after the last menu label.
 *
 * Derived from the same items the bar is built from, and by the same
 * arithmetic the SDK widget uses (`  label  ` plus one column of spacing),
 * so the masthead cannot drift onto the menus when a label is renamed.
 */
export declare function menusEndColumn(): number;
export declare function createMenuBar(screen: Screen): MenuBar;
