"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScreen = createScreen;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createScreen(bbs) {
    const screen = (0, blessed_helpers_1.createScreen)(bbs, {
        title: 'LiveChat v3.2',
        responsive: true,
        smartCSR: false, // Disable smart scroll-region optimization - prevents layout corruption during drag/resize
        fastCSR: false, // Disable fast CSR - forces full redraws for stable dockable panel rendering
    });
    screen.enableMouse();
    return screen;
}
