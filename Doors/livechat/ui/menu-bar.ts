/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
import { Screen, MenuBar as SDKMenuBar, MenuBarItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export const MENU_HEIGHT = 1;

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
  onToggleView?: () => void;     // fullscreen <-> grid
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

// Handlers storage (set dynamically)
let globalHandlers: MenuBarHandlers = {};

const buildMenuItems = (): MenuBarItem[] => ([
  {
    label: 'Chat v3.2.0',
    items: [
      { label: 'Help (F1)', action: () => globalHandlers.onHelp?.() },
      { label: 'Channel List (F2)', action: () => globalHandlers.onList?.() },
      { label: 'Next Channel (F3)', action: () => globalHandlers.onChTab?.() },
      { label: 'Join Channel...', action: () => globalHandlers.onJoinChannel?.() },
      { label: 'Leave Channel', action: () => globalHandlers.onLeaveChannel?.() },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Emoji (F4)', action: () => globalHandlers.onEmoji?.() },
      { label: 'Files (F6)', action: () => globalHandlers.onFiles?.() },
      { label: 'Pins (F7)', action: () => globalHandlers.onPins?.() },
      { label: 'Search (Ctrl+F)', action: () => globalHandlers.onSearch?.() },
      { label: 'Threads', action: () => globalHandlers.onThreads?.() },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Settings (Ctrl+S)', action: () => globalHandlers.onSettings?.() },
      { label: 'Cycle Render Mode (r)', action: () => globalHandlers.onRenderMode?.() },
      { label: 'Fullscreen / Grid', action: () => globalHandlers.onToggleView?.() },
      { label: 'Toggle Sidebar', action: () => globalHandlers.onToggleSidebar?.() },
      { label: 'Clear Chat', action: () => globalHandlers.onClearChat?.() },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'About', action: () => globalHandlers.onAbout?.() },
      { label: 'Keyboard Shortcuts', action: () => globalHandlers.onShortcuts?.() },
      { label: 'Quit (Ctrl+Q)', action: () => globalHandlers.onQuit?.() },
    ],
  },
]);

export function createMenuBar(screen: Screen): MenuBar {
  const menuBar = new SDKMenuBar({
    screen,
    items: buildMenuItems(),
  });

  return {
    element: menuBar,
    setHandlers: (handlers: MenuBarHandlers) => {
      globalHandlers = handlers;
      // Update menu items with new handlers
      menuBar.setItems(buildMenuItems());
    },
  };
}
