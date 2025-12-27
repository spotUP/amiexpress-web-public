/**
 * Screen creation and configuration
 * Creates the main blessed screen instance
 */
import blessed, { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createScreen(bbs: any): Screen {
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: true,
    title: 'LiveChat v3.2',
    output: (data: string) => bbs.write(data),
  });

  screen.enableMouse();

  return screen;
}
