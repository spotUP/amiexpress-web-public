"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theHintRowIsDrawnWhenTheDoorOpens = theHintRowIsDrawnWhenTheDoorOpens;
exports.movingTheCursorKeepsTheHintsAndAddsTheFilename = movingTheCursorKeepsTheHintsAndAddsTheFilename;
exports.aSecondSelectionReplacesOnlyTheFilename = aSecondSelectionReplacesOnlyTheFilename;
/**
 * The RIP browser's key hints survive somebody using the browser.
 *
 * Selecting a file called `footer.setContent()` straight over the hint row,
 * so `Arrows: Navigate  Enter: View  F5: Force View  Q: Quit  /////` was
 * gone the instant anyone pressed Down - the door had a footer only until it
 * was used, which is the same as not having one. The filename is a SUFFIX
 * after the hints now.
 *
 * Driven, not read: the door is started for real and the list's own
 * `select item` event is what moves the cursor.
 */
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text) {
    return String(text ?? '').replace(/\{[^}]*\}/g, '');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Start the door and hand back the footer row and the list.
 *
 * The footer comes back from the SDK call the door makes, which is the only
 * place that knows which element the hints are drawn into. chrome.js is
 * required by path rather than through the theme barrel: the barrel
 * re-exports through getters, so assigning to it changes nothing the door
 * will read.
 */
async function open(themeId = 'uprough-neon') {
    const chrome = require((0, path_1.join)(__dirname, '../../../sdk/dist/engines/ui/theme/chrome.js'));
    const real = chrome.attachDoorChrome;
    let footer = null;
    chrome.attachDoorChrome = (...args) => {
        footer = args[1]?.footer ?? footer;
        return real(...args);
    };
    const theme = (0, theme_1.themeById)(themeId);
    const bbs = {
        write: () => undefined, writeLine: () => undefined, on: () => undefined,
        getTerminalSize: () => ({ width: 80, height: 24 }),
        getTheme: () => theme, connectionType: 'web', unicodeCapable: true,
    };
    const socket = {
        on: () => undefined, once: () => undefined, off: () => undefined,
        emit: () => undefined, removeAllListeners: () => undefined, id: 'rip-test',
    };
    try {
        // dist, not src: dist/app.js is what the board runs, and it is CommonJS,
        // so its call goes through the very module object patched above.
        const { execute } = require('../dist/app.js');
        void execute({
            socket, bbs, user: { username: 'CALLER', id: 'caller-1' },
            bbsSession: { nodeId: 1 }, params: [], close: () => undefined,
        });
        await sleep(200);
    }
    finally {
        chrome.attachDoorChrome = real;
    }
    assert_1.default.ok(footer, 'the door never asked the SDK for its chrome');
    const screen = footer.screen;
    assert_1.default.ok(screen, 'the footer is not attached to a screen');
    // The list is the one child of the main box that has items.
    const findList = (node) => {
        for (const child of node?.children ?? []) {
            if (typeof child.setItems === 'function' && Array.isArray(child.items))
                return child;
            const found = findList(child);
            if (found)
                return found;
        }
        return null;
    };
    const list = findList(screen);
    assert_1.default.ok(list, 'no list was found on the screen');
    return { screen, footer, list };
}
/** Every key cap the hint row promises. */
const CAPS = ['Arrows:', 'Enter:', 'F5:', 'Q:'];
async function theHintRowIsDrawnWhenTheDoorOpens() {
    const { screen, footer } = await open();
    try {
        const row = plain(footer.getContent());
        for (const cap of CAPS) {
            assert_1.default.ok(row.includes(cap), `hint row is missing ${cap}: ${JSON.stringify(row)}`);
        }
        assert_1.default.ok(row.includes('/'), `hint row has no branding tail: ${JSON.stringify(row)}`);
    }
    finally {
        try {
            screen.destroy();
        }
        catch { /* leaving anyway */ }
    }
}
async function movingTheCursorKeepsTheHintsAndAddsTheFilename() {
    const { screen, footer, list } = await open();
    try {
        // What the browser does the moment anyone presses Down.
        list.emit('select item', 'PARTY.RIP');
        await sleep(20);
        const row = plain(footer.getContent());
        assert_1.default.ok(row.includes('PARTY.RIP'), `the selection never reached the footer: ${JSON.stringify(row)}`);
        for (const cap of CAPS) {
            assert_1.default.ok(row.includes(cap), `moving the cursor ate the ${cap} hint: ${JSON.stringify(row)}`);
        }
    }
    finally {
        try {
            screen.destroy();
        }
        catch { /* leaving anyway */ }
    }
}
async function aSecondSelectionReplacesOnlyTheFilename() {
    const { screen, footer, list } = await open();
    try {
        list.emit('select item', 'FIRST.RIP');
        await sleep(20);
        list.emit('select item', 'SECOND.RIP');
        await sleep(20);
        const row = plain(footer.getContent());
        assert_1.default.ok(row.includes('SECOND.RIP'), `second selection missing: ${JSON.stringify(row)}`);
        assert_1.default.ok(!row.includes('FIRST.RIP'), `the suffix accumulated instead of replacing: ${JSON.stringify(row)}`);
        for (const cap of CAPS) {
            assert_1.default.ok(row.includes(cap), `the ${cap} hint went missing: ${JSON.stringify(row)}`);
        }
    }
    finally {
        try {
            screen.destroy();
        }
        catch { /* leaving anyway */ }
    }
}
//# sourceMappingURL=footer.test.js.map