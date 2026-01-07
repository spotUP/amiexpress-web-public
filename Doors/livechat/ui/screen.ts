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
    smartCSR: false,  // Disable smart scroll-region optimization - prevents layout corruption during drag/resize
    fastCSR: false,   // Disable fast CSR - forces full redraws for stable dockable panel rendering
  });

  screen.enableMouse();

  return screen;
}
