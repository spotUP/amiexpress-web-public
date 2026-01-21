"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOJI_BUTTON_WIDTH = exports.INPUT_HEIGHT = void 0;
exports.createInputBox = createInputBox;
exports.createEmojiButton = createEmojiButton;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const status_bar_1 = require("./status-bar");
exports.INPUT_HEIGHT = 3;
exports.EMOJI_BUTTON_WIDTH = 6; // Wide enough for :D with border and padding
function createInputBox(screen) {
    const screenWidth = screen.width || 80;
    return (0, blessed_helpers_1.createTextarea)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT,
        left: 0,
        width: screenWidth - exports.EMOJI_BUTTON_WIDTH, // Leave space for emoji button
        height: exports.INPUT_HEIGHT,
        label: ' Message ',
        border: {
            type: 'line',
            labelStyle: { fg: 'white', bg: 'blue' } // Blue background for label
        },
        inputOnFocus: true,
        tags: true,
        mouse: true,
        style: {
            fg: 'white',
            bg: 'black',
            border: { fg: 'yellow' },
        },
    });
}
function createEmojiButton(screen) {
    const screenWidth = screen.width || 80;
    return (0, blessed_helpers_1.createButton)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT,
        left: screenWidth - exports.EMOJI_BUTTON_WIDTH, // Position at right edge
        width: exports.EMOJI_BUTTON_WIDTH,
        height: exports.INPUT_HEIGHT,
        content: '{center}{yellow-fg}:D{/yellow-fg}{/center}',
        border: { type: 'line', fg: 'yellow' },
        tags: true, // Enable tag parsing for content
        mouse: true,
        keys: true,
        clickable: true,
        style: {
            fg: 'yellow',
            bg: 'black',
            focus: {
                fg: 'black',
                bg: 'yellow'
            },
            hover: {
                fg: 'black',
                bg: 'yellow'
            }
        },
    });
}
