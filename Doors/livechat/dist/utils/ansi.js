"use strict";
/** ANSI color helpers for blessed tags */
Object.defineProperty(exports, "__esModule", { value: true });
exports.colors = void 0;
exports.color = color;
exports.bold = bold;
exports.userName = userName;
exports.timestamp = timestamp;
exports.systemMsg = systemMsg;
exports.errorMsg = errorMsg;
exports.colors = {
    user: 'cyan',
    system: 'gray',
    error: 'red',
    success: 'green',
    info: 'yellow',
    highlight: 'magenta',
    muted: 'gray'
};
/** Wrap text in blessed color tag */
function color(text, c) {
    return `{${c}-fg}${text}{/${c}-fg}`;
}
/** Bold text */
function bold(text) {
    return `{bold}${text}{/bold}`;
}
/** Format username with color */
function userName(name, c) {
    return color(bold(name), c);
}
/** Format timestamp */
function timestamp(time) {
    return color(`[${time}]`, 'gray');
}
/** Format system message */
function systemMsg(text) {
    return color(`*** ${text}`, 'gray');
}
/** Format error message */
function errorMsg(text) {
    return color(`! ${text}`, 'red');
}
