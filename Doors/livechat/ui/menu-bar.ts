/**
 * Menu bar component
 * Shows clickable menu items with hover states at the top of the screen
 */
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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

interface MenuItem {
  label: string;
  key: string;
  width: number;
  handler: keyof MenuBarHandlers;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'F1:Help', key: 'f1', width: 8, handler: 'onHelp' },
  { label: 'F2:List', key: 'f2', width: 8, handler: 'onList' },
  { label: 'F3:Tab', key: 'f3', width: 7, handler: 'onChTab' },
  { label: 'F4:Emoji', key: 'f4', width: 9, handler: 'onEmoji' },
  { label: 'F6:Files', key: 'f6', width: 9, handler: 'onFiles' },
  { label: 'F7:Pins', key: 'f7', width: 8, handler: 'onPins' },
  { label: '^F:Find', key: 'C-f', width: 8, handler: 'onSearch' },
  { label: '^S:Set', key: 'C-s', width: 7, handler: 'onSettings' },
  { label: '^Q:Quit', key: 'C-q', width: 8, handler: 'onQuit' },
];

export function createMenuBar(screen: Screen): MenuBar {
  // Container for the menu bar
  const container = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: MENU_HEIGHT,
    style: {
      fg: 'yellow',
      bg: 'blue',
    },
  });

  // Store handlers
  let handlers: MenuBarHandlers = {};

  // Create clickable buttons for each menu item
  let leftPos = 1;
  const buttons: any[] = [];

  for (const item of MENU_ITEMS) {
    const btn = blessed.box({
      parent: container,
      top: 0,
      left: leftPos,
      width: item.width,
      height: 1,
      content: item.label,
      mouse: true,
      clickable: true,
      style: {
        fg: 'yellow',
        bg: 'blue',
        hover: {
          fg: 'white',
          bg: 'lightblue',
        },
      },
    });

    // Store handler key on button for click handling
    (btn as any)._handlerKey = item.handler;

    btn.on('click', () => {
      const handlerKey = (btn as any)._handlerKey as keyof MenuBarHandlers;
      if (handlers[handlerKey]) {
        handlers[handlerKey]!();
      }
    });

    buttons.push(btn);
    leftPos += item.width + 1; // +1 for spacing
  }

  return {
    element: container,
    setHandlers: (h: MenuBarHandlers) => {
      handlers = h;
    },
  };
}
