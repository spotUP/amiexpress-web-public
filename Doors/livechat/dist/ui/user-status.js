"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserStatus = createUserStatus;
exports.formatUserStatus = formatUserStatus;
exports.updateUserStatus = updateUserStatus;
exports.getStatusSymbol = getStatusSymbol;
/** Status indicator symbols */
const STATUS_SYMBOLS = {
    online: '[*]',
    away: '[~]',
    dnd: '[-]',
    invisible: '[.]',
    offline: '[ ]'
};
/** Create user status summary component */
function createUserStatus(blessed, screen) {
    return blessed.box({
        parent: screen,
        bottom: 2,
        left: 0,
        width: 16,
        height: 1,
        style: { fg: 'green' },
        content: ''
    });
}
/** Format user status summary */
function formatUserStatus(counts) {
    const online = counts.online || 0;
    const away = counts.away || 0;
    const dnd = counts.dnd || 0;
    return ` {green-fg}*${online}{/green-fg} {yellow-fg}~${away}{/yellow-fg} {red-fg}-${dnd}{/red-fg}`;
}
/** Update user status display */
function updateUserStatus(status, counts) {
    status.setContent(formatUserStatus(counts));
}
/** Get status symbol for display */
function getStatusSymbol(status) {
    return STATUS_SYMBOLS[status] || '[?]';
}
