"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatPanelConfig = chatPanelConfig;
exports.formatMessage = formatMessage;
exports.renderMessages = renderMessages;
const theme_1 = require("./theme");
const ansi_1 = require("../utils/ansi");
const format_1 = require("../utils/format");
const door_theme_1 = require("../door-theme");
/** Create chat panel box config */
function chatPanelConfig() {
    return {
        label: ' Chat ',
        border: { type: 'line' },
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: '█', track: { ch: '│', style: { fg: door_theme_1.T.dim } }, style: { fg: door_theme_1.T.accent } },
        tags: true,
        style: {
            fg: door_theme_1.T.ink,
            border: { fg: theme_1.PANEL_BORDER }
        }
    };
}
/** Format message for display */
function formatMessage(msg) {
    const time = (0, ansi_1.timestamp)(msg.time);
    const name = (0, ansi_1.userName)(msg.username, msg.color);
    const content = (0, format_1.escapeContent)(msg.content);
    if (msg.isSystem) {
        return `${time} {${door_theme_1.T.dim}-fg}*** ${content}{/${door_theme_1.T.dim}-fg}`;
    }
    return `${time} ${name}: ${content}`;
}
/** Render messages to box */
function renderMessages(box, messages) {
    const lines = messages.map(formatMessage);
    box.setContent(lines.join('\n'));
    box.setScrollPerc(100);
}
