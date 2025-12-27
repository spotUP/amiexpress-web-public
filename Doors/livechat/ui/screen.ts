/**
 * Screen creation and configuration
 * Creates the main blessed screen instance
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen as createScreenHelper } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export function createScreen(bbs: any): Screen {
  const screen = createScreenHelper(bbs, {
    title: 'LiveChat v3.2',
    responsive: true,
  });

  screen.enableMouse();

  return screen;
}
