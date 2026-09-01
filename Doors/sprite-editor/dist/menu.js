"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENU_HEIGHT = void 0;
exports.createStudioMenuBar = createStudioMenuBar;
/**
 * The studio's menu bar - a thin wrapper over the SDK MenuBar widget,
 * same pattern as livechat's ui/menu-bar.ts. No handler indirection here:
 * bindings.ts's StudioBinding already carries the handler, and
 * BindingSet.menuItems() already shapes it into MenuBarItem[] with the
 * hotkey hint baked into the label, so the menu and the hotkey dispatch
 * through the exact same function reference - there is no second path to
 * keep in sync.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
exports.MENU_HEIGHT = 1;
function createStudioMenuBar(screen, items) {
    return new blessed_1.MenuBar({ screen, items });
}
