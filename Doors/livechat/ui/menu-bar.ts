/**
 * Menu bar component
 * Shows keyboard shortcuts at the top of the screen
 */
import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export const MENU_HEIGHT = 1;

export function createMenuBar(screen: Screen): Box {
  const menuBar = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: MENU_HEIGHT,
    ch: ' ',
    style: {
      fg: 'yellow',
      bg: 'blue',
    },
  });

  menuBar.setContent(' F1:Help  F2:Sidebar  F3:ChTab  F4:Emoji  F5:Art  F6:Files  Tab:Focus  ^S:Set  ^Q:Quit ');

  return menuBar;
}
