/**
 * Menu bar component
 * Shows keyboard shortcuts at the top of the screen
 */
import blessed, { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export const MENU_HEIGHT = 1;

export function createMenuBar(screen: Screen): Box {
  const menuBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: MENU_HEIGHT,
    tags: true,
    ch: ' ',
    style: {
      fg: 'yellow',
      bg: 'blue',
    },
  });

  menuBar.setContent(' F1:Help  F2:Sidebar  F3:ChTab  F4:Emoji  F5:Art  F6:Files  Tab:Focus  ^S:Set  ^Q:Quit ');

  return menuBar;
}
