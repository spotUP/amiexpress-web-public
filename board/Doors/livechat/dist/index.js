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
    // Check if this is chat-only mode without a real logged-in user.
    // IMPORTANT: session.user is ALWAYS set by the backend (uses guest User
    // as a shim when bbsSession.user is absent). The authoritative signal of
    // "user is logged in" is bbsSession.user — that's only populated after a
    // real authentication flow (BBS login or runChatOnlyLogin).
    const chatOnly = session.bbsSession?.tempData?.chatOnly;
    const hasRealUser = !!session.bbsSession?.user;
    if (chatOnly && !hasRealUser) {
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
