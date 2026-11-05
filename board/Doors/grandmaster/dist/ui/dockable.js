"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDockable = createDockable;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Creates a regular Box widget (replaces DockablePanel to prevent dragging issues)
 *
 * This is a drop-in replacement that converts DockablePanel options to Box options.
 */
function createDockable(options) {
    // Extract Box-compatible options, ignore dockable-specific ones
    const { persistenceKey, fitContent, allowAutoDock, resizable, draggable, dockPosition, useTitleBar, fixed, ...boxOptions } = options;
    return (0, blessed_helpers_1.createBox)(boxOptions);
}
//# sourceMappingURL=dockable.js.map