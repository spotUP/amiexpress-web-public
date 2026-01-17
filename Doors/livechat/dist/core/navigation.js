"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNavState = createNavState;
exports.navUp = navUp;
exports.navDown = navDown;
exports.getSelectedChannel = getSelectedChannel;
exports.getVisibleChannels = getVisibleChannels;
exports.selectById = selectById;
/** Create navigation state */
function createNavState(maxVisible = 15) {
    return { selectedIndex: 0, scrollOffset: 0, maxVisible };
}
/** Move selection up */
function navUp(nav, channels) {
    if (nav.selectedIndex > 0) {
        nav.selectedIndex--;
        if (nav.selectedIndex < nav.scrollOffset) {
            nav.scrollOffset = nav.selectedIndex;
        }
        return true;
    }
    return false;
}
/** Move selection down */
function navDown(nav, channels) {
    if (nav.selectedIndex < channels.length - 1) {
        nav.selectedIndex++;
        if (nav.selectedIndex >= nav.scrollOffset + nav.maxVisible) {
            nav.scrollOffset = nav.selectedIndex - nav.maxVisible + 1;
        }
        return true;
    }
    return false;
}
/** Get selected channel */
function getSelectedChannel(nav, channels) {
    return channels[nav.selectedIndex] || null;
}
/** Get visible channels for rendering */
function getVisibleChannels(nav, channels) {
    return channels.slice(nav.scrollOffset, nav.scrollOffset + nav.maxVisible);
}
/** Select channel by ID */
function selectById(nav, channels, id) {
    const idx = channels.findIndex(c => c.id === id);
    if (idx >= 0) {
        nav.selectedIndex = idx;
        return true;
    }
    return false;
}
