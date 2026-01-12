import { createDockablePanel } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { DockablePanel, DockablePanelOptions } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createDockable(options: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    fitContent: false,
    allowAutoDock: true,
    resizable: true,
    draggable: true,
    dockPosition: 'float',
    ...options,
  });
}
