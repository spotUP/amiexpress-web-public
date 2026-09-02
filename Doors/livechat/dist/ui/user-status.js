"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserStatus = createUserStatus;
exports.formatUserStatus = formatUserStatus;
exports.updateUserStatus = updateUserStatus;
exports.getStatusSymbol = getStatusSymbol;
const door_theme_1 = require("../door-theme");
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
        style: { fg: door_theme_1.T.ok },
        content: ''
    });
}
/** Format user status summary */
function formatUserStatus(counts) {
    const online = counts.online || 0;
    const away = counts.away || 0;
    const dnd = counts.dnd || 0;
    return ` {${door_theme_1.T.ok}-fg}*${online}{/${door_theme_1.T.ok}-fg} {${door_theme_1.T.accentAlt}-fg}~${away}{/${door_theme_1.T.accentAlt}-fg} {${door_theme_1.T.alert}-fg}-${dnd}{/${door_theme_1.T.alert}-fg}`;
}
/** Update user status display */
function updateUserStatus(status, counts) {
    status.setContent(formatUserStatus(counts));
}
/** Get status symbol for display */
function getStatusSymbol(status) {
    return STATUS_SYMBOLS[status] || '[?]';
}
