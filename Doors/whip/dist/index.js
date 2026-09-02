"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
exports.metadata = {
    name: 'Whip',
    version: '1.0.0',
    description: 'Demo Scene Project Management',
    author: 'AmiExpress Team',
    command: 'WHIP',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const app = new app_1.WhipApp(ctx);
    await app.run();
});
exports.default = door;
