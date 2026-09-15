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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const path = __importStar(require("path"));
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const server_1 = require("./server");
const app_1 = require("./app");
const jamaica_1 = require("./config/jamaica");
const settings_1 = require("./settings");
const door_theme_1 = require("./door-theme");
exports.metadata = {
    name: 'GANJA WARS',
    version: '1.0.0',
    description: 'Jamaican drug trading game — buy low, sell high, survive Babylon',
    author: 'AmiExpress-Web',
    command: 'GANJA',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    // Before the layout is built: T and S are live bindings, so every style
    // object in ui/ reads the caller's theme rather than the classic default.
    (0, door_theme_1.applyTheme)(ctx.bbs);
    const doorDir = path.join(__dirname, '..');
    const settings = (0, settings_1.loadSettings)();
    const cfg = {
        numTurns: settings.numTurns,
        startCash: settings.startCash,
        startDebt: settings.startDebt,
        debtInterest: settings.debtInterest,
        bankInterest: settings.bankInterest,
        discordWebhook: process.env.DOPEWARS_DISCORD_WEBHOOK ?? '',
        notifyLivechat: settings.notifyLivechat,
        theme: jamaica_1.JAMAICA_THEME,
    };
    const server = server_1.DopewarsServer.getInstance();
    await server.init(doorDir, cfg, ctx.bbs);
    await (0, app_1.createApp)(ctx, server);
});
exports.default = door;
//# sourceMappingURL=index.js.map