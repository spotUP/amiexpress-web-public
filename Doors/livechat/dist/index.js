"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const config_1 = require("./config");
Object.defineProperty(exports, "metadata", { enumerable: true, get: function () { return config_1.metadata; } });
const services_1 = require("./services");
const server_1 = require("./server");
const chat_only_login_1 = require("./chat-only-login");
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(config_1.metadata);
door.onStart(async (ctx) => {
    const session = ctx;
    // Check if this is chat-only mode without a user (needs login)
    const chatOnly = session.bbsSession?.tempData?.chatOnly;
    const hasUser = session.user || session.bbsSession?.user;
    if (chatOnly && !hasUser) {
        // Show login modal and wait for authentication
        const loginSuccessful = await (0, chat_only_login_1.runChatOnlyLogin)(session);
        if (!loginSuccessful) {
            return;
        }
    }
    const app = await (0, server_1.createApp)(session);
    await app.run();
    services_1.events.clear();
});
exports.default = door;
