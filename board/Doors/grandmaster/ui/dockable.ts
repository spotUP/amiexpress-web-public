import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * Creates a regular Box widget (replaces DockablePanel to prevent dragging issues)
 *
 * This is a drop-in replacement that converts DockablePanel options to Box options.
 */
export function createDockable(options: any): Box {
  // Extract Box-compatible options, ignore dockable-specific ones
  const {
    persistenceKey,
    fitContent,
    allowAutoDock,
    resizable,
    draggable,
    dockPosition,
    useTitleBar,
    fixed,
    ...boxOptions
  } = options;

  return createBox(boxOptions);
}
