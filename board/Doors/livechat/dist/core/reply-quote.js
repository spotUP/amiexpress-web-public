"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteInputText = quoteInputText;
exports.formatReplyQuote = formatReplyQuote;
/**
 * A reply is a room line with a parent. The quote row shown above it is built
 * here, once, for the sender's local echo and for lines arriving from others.
 */
const door_theme_1 = require("../door-theme");
const format_1 = require("../utils/format");
const SNIPPET_LENGTH = 60;
/** The flat, clipped text of a parent: one row, no newlines. */
function snippet(parent) {
    return String(parent.content ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
}
/**
 * What the context menu's Quote puts in the input box: `> <user>: <text> `,
 * plain text, cursor after it, ready for the caller's own words. Quote used to
 * put only `> ` there, so the sent line said nothing about what was quoted.
 */
function quoteInputText(parent) {
    return `> ${parent.username}: ${snippet(parent)} `;
}
/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
function formatReplyQuote(parent) {
    const flat = snippet(parent);
    return `{${door_theme_1.T.dim}-fg}  > ${(0, format_1.escapeContent)(parent.username)}: ${(0, format_1.escapeContent)(flat)}{/${door_theme_1.T.dim}-fg}`;
}
