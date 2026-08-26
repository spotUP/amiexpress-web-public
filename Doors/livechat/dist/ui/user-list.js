"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserList = createUserList;
exports.formatUserItem = formatUserItem;
exports.buildUserListItems = buildUserListItems;
const theme_1 = require("./theme");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const types_1 = require("../types");
const ansi_1 = require("../utils/ansi");
/** Create user list component */
function createUserList(screen) {
    return (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 1,
        right: 0,
        width: 20,
        height: '100%-3',
        label: ' USERS ',
        border: { type: 'line' },
        hidden: true,
        style: {
            fg: 'white',
            border: { fg: theme_1.PANEL_BORDER },
            selected: { bg: 'blue', fg: 'white' },
        },
        scrollbar: { ch: '█' },
        tags: true
    });
}
/** Format user for list */
function formatUserItem(member, status, isTyping) {
    const indicator = types_1.PRESENCE_INDICATORS[status];
    const c = types_1.PRESENCE_COLORS[status];
    const prefix = isTyping ? '*' : ' ';
    let name = member.username;
    if (member.role === 'owner' || member.role === 'admin') {
        name = (0, ansi_1.bold)(name);
    }
    return `${prefix}${(0, ansi_1.color)(indicator, c)} ${name}`;
}
/** Build user list items */
function buildUserListItems(members, presenceMap, typingSet) {
    return members.map(m => formatUserItem(m, presenceMap.get(m.userId) || 'offline', typingSet.has(m.userId)));
}
