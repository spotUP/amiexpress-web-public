"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDmLine = formatDmLine;
/** Pure DM/Group-DM line formatter for blessed rendering. */
function formatDmLine(d) {
    if (!d)
        return '';
    if (d.isGroup) {
        const list = Array.isArray(d.participants) && d.participants.length > 0
            ? d.participants.join(', ')
            : '(none)';
        const header = d.direction === 'sent'
            ? `[Group DM to ${list}]`
            : `[Group DM from ${d.from || '?'}]`;
        const color = d.direction === 'sent' ? 'magenta-fg' : 'cyan-fg';
        const offlineHint = d.direction === 'sent' && d.delivered === false ? ' {gray-fg}(offline){/gray-fg}' : '';
        return `{${color}}${header}: ${d.message}${offlineHint}{/${color}}`;
    }
    const dir = d.direction === 'sent' ? `[DM to ${d.to || '?'}]` : `[DM from ${d.from || '?'}]`;
    const color = d.direction === 'sent' ? 'magenta-fg' : 'cyan-fg';
    const offlineHint = d.direction === 'sent' && d.delivered === false ? ' {gray-fg}(offline){/gray-fg}' : '';
    return `{${color}}${dir}: ${d.message}${offlineHint}{/${color}}`;
}
