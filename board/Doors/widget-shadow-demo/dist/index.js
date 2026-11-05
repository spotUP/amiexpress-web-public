"use strict";
/**
 * Widget Shadow Demo - Entry Point
 *
 * Exact replica of blessed widget-shadow.js demo
 * Demonstrates shadows and neo-blessed style transparency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_js_1 = require("./app.js");
/** Door metadata */
exports.metadata = {
    name: 'Widget Shadow Demo',
    version: '1.0.0',
    description: 'Exact replica of blessed widget-shadow.js - demonstrates shadows and transparency',
    author: 'blessed (ported)',
    command: 'SHADOWDEMO',
};
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    await (0, app_js_1.createApp)(ctx);
});
exports.default = door;
//# sourceMappingURL=index.js.map