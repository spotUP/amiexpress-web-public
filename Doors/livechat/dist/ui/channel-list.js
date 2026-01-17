"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChannelList = createChannelList;
exports.formatChannelItem = formatChannelItem;
exports.groupChannels = groupChannels;
exports.buildChannelListItems = buildChannelListItems;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/** Create channel list component */
function createChannelList(screen) {
    return (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 1,
        left: 0,
        width: 16,
        height: '100%-3',
        label: ' CHANNELS ',
        border: { type: 'line' },
        style: {
            fg: 'white',
            border: { fg: 'cyan' },
            selected: { bg: 'blue', fg: 'white', bold: true },
            item: { fg: 'white' },
        },
        keys: true,
        vi: true,
        scrollbar: { ch: '█' }
    });
}
/** Format channel item for list */
function formatChannelItem(ch, unread) {
    const prefix = ch.type === 'dm' ? '@' : '#';
    const badge = unread > 0 ? ` (${unread})` : '';
    return `${prefix}${ch.name}${badge}`;
}
/** Group channels by category */
function groupChannels(channels) {
    const grouped = new Map();
    for (const ch of channels) {
        const cat = ch.category || 'Other';
        if (!grouped.has(cat))
            grouped.set(cat, []);
        grouped.get(cat).push(ch);
    }
    return grouped;
}
/** Build list items with categories */
function buildChannelListItems(channels) {
    const items = [];
    const grouped = groupChannels(channels);
    for (const [cat, chs] of grouped) {
        items.push(`{bold}${cat}{/bold}`);
        for (const ch of chs) {
            items.push(`  ${formatChannelItem(ch, 0)}`);
        }
    }
    return items;
}
