"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLayout = createLayout;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createLayout(session) {
    const bbs = session?.bbs ?? session;
    const screen = (0, blessed_helpers_1.createScreen)(bbs, {
        smartCSR: true,
    });
    const header = blessed_1.default.box({
        parent: screen, top: 0, left: 0, width: '100%', height: 1,
        tags: true,
        style: { fg: 'white', bg: 'blue' },
        content: '',
    });
    const market = blessed_1.default.box({
        parent: screen, top: 1, left: 0, width: '34%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
        label: ' MARKET ',
        scrollable: true, keys: true, vi: true,
        content: '',
    });
    const inventory = blessed_1.default.box({
        parent: screen, top: 1, left: '34%', width: '33%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
        label: ' INVENTORY ',
        content: '',
    });
    const events = blessed_1.default.box({
        parent: screen, top: 1, left: '67%', width: '33%', height: '75%-1',
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
        label: ' EVENTS ',
        scrollable: true, alwaysScroll: true,
        content: '',
    });
    const players = blessed_1.default.box({
        parent: screen, top: '75%', left: 0, width: '100%', height: 3,
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'yellow' }, fg: 'yellow', bg: 'black' },
        label: ' PLAYERS HERE ',
        content: '---',
    });
    const actions = blessed_1.default.box({
        parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
        tags: true,
        style: { fg: 'white', bg: 'blue' },
        content: '',
    });
    return { screen, header, market, inventory, events, players, actions };
}
//# sourceMappingURL=layout.js.map