"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatPanelConfig = chatPanelConfig;
exports.formatMessage = formatMessage;
exports.renderMessages = renderMessages;
const theme_1 = require("./theme");
const ansi_1 = require("../utils/ansi");
const format_1 = require("../utils/format");
/** Create chat panel box config */
function chatPanelConfig() {
    return {
        label: ' Chat ',
        border: { type: 'line' },
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: '█', track: { ch: '│', style: { fg: 'gray' } }, style: { fg: 'cyan' } },
        tags: true,
        style: {
            fg: 'white',
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
        return `${time} {gray-fg}*** ${content}{/gray-fg}`;
    }
    return `${time} ${name}: ${content}`;
}
/** Render messages to box */
function renderMessages(box, messages) {
    const lines = messages.map(formatMessage);
    box.setContent(lines.join('\n'));
    box.setScrollPerc(100);
}
