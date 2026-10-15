"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBBSEvent = formatBBSEvent;
const types_1 = require("../types");
const format_1 = require("../utils/format");
const ansi_1 = require("../utils/ansi");
const event_msg_1 = require("./event-msg");
/** Format BBS event for display */
function formatBBSEvent(event) {
    const time = (0, format_1.formatTime)(event.timestamp);
    const prefix = types_1.EVENT_PREFIXES[event.type] || '[SYS]';
    const { msg, c } = (0, event_msg_1.getEventMessage)(event);
    return (0, ansi_1.color)(`[${time}] ${prefix} ${msg}`, c);
}
