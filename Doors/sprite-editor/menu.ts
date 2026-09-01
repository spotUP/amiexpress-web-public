/**
 * The studio's menu bar - a thin wrapper over the SDK MenuBar widget,
 * same pattern as livechat's ui/menu-bar.ts. No handler indirection here:
 * bindings.ts's StudioBinding already carries the handler, and
 * BindingSet.menuItems() already shapes it into MenuBarItem[] with the
 * hotkey hint baked into the label, so the menu and the hotkey dispatch
 * through the exact same function reference - there is no second path to
 * keep in sync.
 */
import { Screen, MenuBar, MenuBarItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export const MENU_HEIGHT = 1;

export function createStudioMenuBar(screen: Screen, items: MenuBarItem[]): MenuBar {
  return new MenuBar({ screen, items });
}
