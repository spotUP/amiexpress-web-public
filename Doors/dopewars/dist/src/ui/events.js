"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushEvent = pushEvent;
exports.clearEvents = clearEvents;
const MAX_EVENTS = 60;
const log = [];
function pushEvent(box, text) {
    log.unshift('{cyan-fg}>{/} ' + text);
    if (log.length > MAX_EVENTS)
        log.pop();
    box.setContent(log.join('\n'));
}
function clearEvents(box) {
    log.length = 0;
    box.setContent('');
}
//# sourceMappingURL=events.js.map