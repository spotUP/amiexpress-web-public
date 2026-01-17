"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inputBoxConfig = inputBoxConfig;
exports.formatTyping = formatTyping;
exports.statusLineConfig = statusLineConfig;
const ansi_1 = require("../utils/ansi");
/** Create input box config */
function inputBoxConfig() {
    return {
        label: ' Message ',
        border: { type: 'line' },
        inputOnFocus: true,
        tags: true,
        style: {
            border: { fg: 'green' },
            focus: { border: { fg: 'yellow' } }
        }
    };
}
/** Format typing indicator */
function formatTyping(users) {
    if (users.length === 0)
        return '';
    if (users.length === 1) {
        return (0, ansi_1.color)(`${users[0].username} is typing...`, 'gray');
    }
    if (users.length === 2) {
        return (0, ansi_1.color)(`${users[0].username} and ${users[1].username} are typing...`, 'gray');
    }
    return (0, ansi_1.color)(`${users.length} people are typing...`, 'gray');
}
/** Create status line config */
function statusLineConfig() {
    return {
        height: 1,
        tags: true,
        style: { fg: 'gray' }
    };
}
