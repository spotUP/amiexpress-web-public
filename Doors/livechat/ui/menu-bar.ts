/**
 * Menu bar component - uses SDK FKeyBar widget
 */
import { Screen, FKeyBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { FKeyItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export const MENU_HEIGHT = 1;

export interface MenuBarHandlers {
  onHelp?: () => void;
  onList?: () => void;
  onChTab?: () => void;
  onEmoji?: () => void;
  onFiles?: () => void;
  onPins?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
  onQuit?: () => void;
}

export interface MenuBar {
  element: Box;
  setHandlers: (handlers: MenuBarHandlers) => void;
}

// Handlers storage (set dynamically)
let globalHandlers: MenuBarHandlers = {};

const MENU_ITEMS: FKeyItem[] = [
  { label: 'F1:Help', key: 'f1', width: 8, id: 'help', handler: () => globalHandlers.onHelp?.() },
  { label: 'F2:List', key: 'f2', width: 8, id: 'list', handler: () => globalHandlers.onList?.() },
  { label: 'F3:Tab', key: 'f3', width: 7, id: 'chtab', handler: () => globalHandlers.onChTab?.() },
  { label: 'F4:Emoji', key: 'f4', width: 9, id: 'emoji', handler: () => globalHandlers.onEmoji?.() },
  { label: 'F6:Files', key: 'f6', width: 9, id: 'files', handler: () => globalHandlers.onFiles?.() },
  { label: 'F7:Pins', key: 'f7', width: 8, id: 'pins', handler: () => globalHandlers.onPins?.() },
  { label: '^F:Find', key: 'C-f', width: 8, id: 'search', handler: () => globalHandlers.onSearch?.() },
  { label: '^S:Set', key: 'C-s', width: 7, id: 'settings', handler: () => globalHandlers.onSettings?.() },
  { label: '^Q:Quit', key: 'C-q', width: 8, id: 'quit', handler: () => globalHandlers.onQuit?.() },
];

export function createMenuBar(screen: Screen): MenuBar {
  const fkeyBar = new FKeyBar({
    parent: screen,
    items: MENU_ITEMS,
    top: 0,
    left: 0,
    width: '100%',
    barHeight: MENU_HEIGHT,
    fg: 'yellow',
    bg: 'blue',
    hoverFg: 'white',
    hoverBg: 'lightblue',
    spacing: 1,
    autoRegisterKeys: true,
  });

  return {
    element: fkeyBar as unknown as Box,
    setHandlers: (handlers: MenuBarHandlers) => {
      globalHandlers = handlers;
    },
  };
}
