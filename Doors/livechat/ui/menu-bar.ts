/**
 * Menu bar component - dropdown menus
 */
import { Screen, DropdownMenu } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

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

const MENU_LABELS = ['Chat', 'Tools', 'View', 'Help'];

const buildMenuItems = (): Array<{ label: string; items: Array<{ label: string; action: () => void }> }> => ([
  {
    label: 'Chat',
    items: [
      { label: 'Help (F1)', action: () => globalHandlers.onHelp?.() },
      { label: 'Channel List (F2)', action: () => globalHandlers.onList?.() },
      { label: 'Next Channel (F3)', action: () => globalHandlers.onChTab?.() },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Emoji (F4)', action: () => globalHandlers.onEmoji?.() },
      { label: 'Files (F6)', action: () => globalHandlers.onFiles?.() },
      { label: 'Pins (F7)', action: () => globalHandlers.onPins?.() },
      { label: 'Search (Ctrl+F)', action: () => globalHandlers.onSearch?.() },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Settings (Ctrl+S)', action: () => globalHandlers.onSettings?.() },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Quit (Ctrl+Q)', action: () => globalHandlers.onQuit?.() },
    ],
  },
]);

export function createMenuBar(screen: Screen): MenuBar {
  const bar = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: MENU_HEIGHT,
    style: { fg: 'white', bg: 'blue' },
    content: '',
    fixed: true,
  });

  const menuButtons: Box[] = [];
  const menus: DropdownMenu[] = [];
  const menuDefs = buildMenuItems();
  menuDefs.forEach((menu) => {
    menus.push(new DropdownMenu({ parent: screen, label: menu.label, items: menu.items }));
  });

  const openMenu = (index: number) => {
    menus.forEach((menu, i) => {
      if (i !== index) menu.close();
    });
    menus[index].openFor(menuButtons[index]);
  };

  const setupMenuButtons = () => {
    let left = 1;
    MENU_LABELS.forEach((label, index) => {
      const button = createBox({
        parent: bar,
        top: 0,
        left,
        width: label.length + 2,
        height: 1,
        content: `{bold}${label}{/bold}`,
        style: { fg: 'white', bg: 'blue', focus: { fg: 'black', bg: 'cyan' } },
        mouse: true,
        keys: true,
        clickable: true,
        fixed: true,
      });

      button.on('click', () => openMenu(index));
      button.key(['enter', 'space', 'down'], () => openMenu(index));

      menus[index].on('tab-next', () => openMenu((index + 1) % menus.length));
      menus[index].on('tab-prev', () => openMenu((index - 1 + menus.length) % menus.length));

      menuButtons.push(button);
      left += label.length + 3;
    });
  };

  setupMenuButtons();

  return {
    element: bar as unknown as Box,
    setHandlers: (handlers: MenuBarHandlers) => {
      globalHandlers = handlers;
      const updatedDefs = buildMenuItems();
      updatedDefs.forEach((menu, index) => {
        menus[index]?.setItems(menu.items);
      });
    },
  };
}
