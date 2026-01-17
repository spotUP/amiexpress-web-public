"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTime = formatTime;
exports.truncate = truncate;
exports.wrapText = wrapText;
exports.escapeContent = escapeContent;
/** Format time for display */
function formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}
/** Truncate text with ellipsis */
function truncate(text, max) {
    if (text.length <= max)
        return text;
    return text.slice(0, max - 3) + '...';
}
/** Wrap text to width */
function wrapText(text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
        if (line.length + word.length + 1 > width) {
            if (line)
                lines.push(line);
            line = word;
        }
        else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line)
        lines.push(line);
    return lines;
}
/** Escape special chars for blessed tags */
function escapeContent(text) {
    return text.replace(/\{/g, '{open}').replace(/\}/g, '{close}');
}
