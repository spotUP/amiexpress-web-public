"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDockable = createDockable;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createDockable(options) {
    return (0, blessed_helpers_1.createDockablePanel)({
        useTitleBar: false,
        fitContent: false,
        fixed: true, // Static panels for BBS environment
        // Remove dockable features inappropriate for BBS:
        // allowAutoDock: true,
        // resizable: true,
        // draggable: true,
        // dockPosition: 'float',
        ...options, // User can override fixed if needed
    });
}
//# sourceMappingURL=dockable.js.map