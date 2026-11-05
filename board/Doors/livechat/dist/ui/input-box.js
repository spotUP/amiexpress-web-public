"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOJI_BUTTON_WIDTH = exports.INPUT_HEIGHT = void 0;
exports.createInputBox = createInputBox;
exports.createEmojiButton = createEmojiButton;
/**
 * Input box component
 * Text input for chat messages with emoji button
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const status_bar_1 = require("./status-bar");
const theme_1 = require("./theme");
const door_theme_1 = require("../door-theme");
exports.INPUT_HEIGHT = 3;
exports.EMOJI_BUTTON_WIDTH = 6; // Wide enough for :D with border and padding
function createInputBox(screen) {
    const screenWidth = screen.width || 80;
    // Use SDK custom Textarea class (via factory function) which has built-in
    // effect rendering via _convertEffectTags() that converts ~wave~, ~rainbow~, etc.
    // to blessed color tags automatically while preserving selection markers.
    const input = (0, blessed_1.textarea)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT,
        left: 0,
        width: screenWidth - exports.EMOJI_BUTTON_WIDTH, // Leave space for emoji button
        height: exports.INPUT_HEIGHT,
        label: ' Message ',
        border: {
            type: 'line',
            labelStyle: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar } // Blue background for label
        },
        inputOnFocus: true,
        // tags: true is forced by factory function
        mouse: true,
        ch: ' ', // CRITICAL: Fill background to prevent corruption from overlapping widgets
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: { fg: theme_1.PANEL_BORDER },
            focus: { border: { fg: theme_1.PANEL_BORDER_FOCUS } },
        },
        // @ts-ignore - zIndex exists but not in types
        zIndex: 5000, // Below command suggestions (10000) but above other elements
    });
    // Ensure input renders after other elements
    input.setIndex(500);
    return input;
}
function createEmojiButton(screen) {
    const screenWidth = screen.width || 80;
    return (0, blessed_helpers_1.createButton)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT,
        left: screenWidth - exports.EMOJI_BUTTON_WIDTH, // Position at right edge
        width: exports.EMOJI_BUTTON_WIDTH,
        height: exports.INPUT_HEIGHT,
        content: `{center}{${door_theme_1.T.accentAlt}-fg}:D{/${door_theme_1.T.accentAlt}-fg}{/center}`,
        border: { type: 'line' }, // colour lives in style.border - see below
        tags: true, // Enable tag parsing for content
        mouse: true,
        keys: true,
        clickable: true,
        style: {
            fg: door_theme_1.T.accentAlt,
            bg: door_theme_1.T.ground,
            focus: {
                fg: door_theme_1.T.ground,
                bg: door_theme_1.T.accentAlt
            },
            hover: {
                fg: door_theme_1.T.ground,
                bg: door_theme_1.T.accentAlt
            }
        },
    });
}
