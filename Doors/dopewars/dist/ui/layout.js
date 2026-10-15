"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLayout = createLayout;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_theme_1 = require("../door-theme");
function createLayout(session) {
    const bbs = session?.bbs ?? session;
    const screen = (0, blessed_helpers_1.createScreen)(bbs, {
        smartCSR: false,
    });
    const header = blessed_1.default.box({
        parent: screen, top: 0, left: 0, width: '100%', height: 1,
        tags: true,
        // A bar, not a framed box: blessed.box builds a Panel, and Panel draws a
        // line border when the caller names none. A one-row box with a frame has
        // no interior, so this header has never shown a character of its content.
        border: undefined,
        // A bar takes the bar TOKENS. The SDK's own footerStyle() is
        // {fg: dim, bg: tokens.bar}, so the bar token is what a bar's ground is;
        // classic's are blue/white, which is what this always was.
        style: { fg: door_theme_1.T.barInk, bg: door_theme_1.T.bar },
        content: '',
    });
    const market = blessed_1.default.box({
        parent: screen, top: 1, left: 0, width: '34%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: door_theme_1.S.panel.style,
        label: ' MARKET ',
        scrollable: true, keys: true, vi: true,
        content: '',
    });
    const inventory = blessed_1.default.box({
        parent: screen, top: 1, left: '34%', width: '28%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: door_theme_1.S.panel.style,
        label: ' INVENTORY ',
        content: '',
    });
    const events = blessed_1.default.box({
        parent: screen, top: 1, left: '62%', width: '38%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: door_theme_1.S.panel.style,
        label: ' EVENTS ',
        scrollable: true, alwaysScroll: true,
        content: '',
    });
    const players = blessed_1.default.box({
        parent: screen, top: '75%', left: 0, width: '100%', height: 3,
        border: { type: 'line' },
        tags: true,
        style: { ...door_theme_1.S.panel.style, fg: door_theme_1.T.accent },
        label: ' PLAYERS HERE ',
        content: '---',
    });
    const actions = blessed_1.default.box({
        parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
        tags: true,
        style: { fg: door_theme_1.T.barInk, bg: door_theme_1.T.bar },
        content: '',
    });
    return { screen, header, market, inventory, events, players, actions };
}
//# sourceMappingURL=layout.js.map