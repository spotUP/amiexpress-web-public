"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommandRegistry = createCommandRegistry;
__exportStar(require("./types"), exports);
const types_1 = require("./types");
const channel_1 = require("./channel");
const messaging_1 = require("./messaging");
const user_1 = require("./user");
const moderation_1 = require("./moderation");
const utility_1 = require("./utility");
const prefs_1 = require("./prefs");
const mic_1 = require("./mic");
const reactions_1 = require("./reactions");
const voice_1 = require("./voice");
const mode_1 = require("./mode");
/** Create command registry with all commands */
function createCommandRegistry() {
    const r = new types_1.CommandRegistry();
    // Channel
    [channel_1.joinCmd, channel_1.leaveCmd, channel_1.createCmd, channel_1.topicCmd, channel_1.deleteCmd].forEach(c => r.register(c));
    // Messaging
    [messaging_1.msgCmd, messaging_1.meCmd, messaging_1.replyCmd, messaging_1.threadCmd, messaging_1.editCmd].forEach(c => r.register(c));
    // User
    [user_1.whoCmd, user_1.whoisCmd, user_1.awayCmd, user_1.backCmd, user_1.statusCmd, user_1.nickCmd].forEach(c => r.register(c));
    // Moderation
    [moderation_1.kickCmd, moderation_1.banCmd, moderation_1.unbanCmd, moderation_1.muteCmd, moderation_1.opCmd].forEach(c => r.register(c));
    // Utility
    [utility_1.quitCmd, utility_1.clearCmd, utility_1.searchCmd, utility_1.pinCmd, utility_1.pinsCmd].forEach(c => r.register(c));
    r.register((0, utility_1.helpCmd)(r));
    // Prefs
    [prefs_1.soundsCmd, prefs_1.compactCmd, prefs_1.timestampsCmd, mic_1.micCmd].forEach(c => r.register(c));
    // Note: eventsCmd is registered in app.ts after dependencies are available
    // Reactions
    [reactions_1.reactCmd, reactions_1.unreactCmd, reactions_1.reactionsCmd, reactions_1.thumbsUpCmd, reactions_1.heartCmd].forEach(c => r.register(c));
    // Voice
    [voice_1.voiceCmd, voice_1.deafenCmd, voice_1.undeafenCmd].forEach(c => r.register(c));
    // Channel mode / MOTD / invites
    [mode_1.motdCmd, mode_1.inviteCmd, mode_1.uninviteCmd, mode_1.modeCmd].forEach(c => r.register(c));
    return r;
}
