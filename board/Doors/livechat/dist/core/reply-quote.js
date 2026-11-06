"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatReplyQuote = formatReplyQuote;
/**
 * A reply is a room line with a parent. The quote row shown above it is built
 * here, once, for the sender's local echo and for lines arriving from others.
 */
const door_theme_1 = require("../door-theme");
const format_1 = require("../utils/format");
const SNIPPET_LENGTH = 60;
/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
function formatReplyQuote(parent) {
    const flat = String(parent.content ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
    return `{${door_theme_1.T.dim}-fg}  > ${(0, format_1.escapeContent)(parent.username)}: ${(0, format_1.escapeContent)(flat)}{/${door_theme_1.T.dim}-fg}`;
}
