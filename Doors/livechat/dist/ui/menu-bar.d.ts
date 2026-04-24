/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
import { Screen, MenuBar as SDKMenuBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare const MENU_HEIGHT = 1;
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
}
export declare function createMenuBar(screen: Screen): MenuBar;
