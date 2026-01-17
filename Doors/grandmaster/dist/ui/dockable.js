"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDockable = createDockable;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createDockable(options) {
    return (0, blessed_helpers_1.createDockablePanel)({
        useTitleBar: false,
        fitContent: false,
        allowAutoDock: true,
        resizable: true,
        draggable: true,
        dockPosition: 'float',
        ...options,
    });
}
//# sourceMappingURL=dockable.js.map