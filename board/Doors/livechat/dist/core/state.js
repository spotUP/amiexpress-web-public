"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelsToShow = channelsToShow;
exports.togglePinnedChannel = togglePinnedChannel;
exports.markChannelUnread = markChannelUnread;
exports.createInitialState = createInitialState;
exports.setChannel = setChannel;
exports.setDmContext = setDmContext;
exports.clearDmContext = clearDmContext;
exports.addMessage = addMessage;
exports.clearInput = clearInput;
exports.appendInput = appendInput;
exports.backspaceInput = backspaceInput;
const mute_list_1 = require("./mute-list");
/**
 * The channels the door lists: the server's list once it has answered,
 * otherwise the default channel plus random and help. The sidebar and
 * /rooms both read this, so they never disagree.
 */
function channelsToShow(channels, defaultChannel, pinned = []) {
    const list = channels.length > 0 ? channels : fallbackChannels(defaultChannel);
    if (pinned.length === 0)
        return list;
    const isPinned = (c) => pinned.includes(c.name);
    // Stable: pinned first, each group keeps the server's order.
    return [...list.filter(isPinned), ...list.filter((c) => !isPinned(c))];
}
/** Pin or unpin a channel in the user's prefs. Returns true when it is now pinned. */
function togglePinnedChannel(state, name) {
    const cur = state.prefs.pinnedChannels ?? [];
    const now = !cur.includes(name);
    state.prefs.pinnedChannels = now ? [...cur, name] : cur.filter((n) => n !== name);
    return now;
}
/** Give a channel an unread count again so the sidebar shows it unread. */
function markChannelUnread(state, name) {
    const ch = state.channels.find((c) => c.name === name || c.id === name);
    if (!ch)
        return false;
    ch.unreadCount = Math.max(1, ch.unreadCount ?? 0);
    return true;
}
function fallbackChannels(defaultChannel) {
    return [defaultChannel, 'random', 'help'].map((name) => ({
        id: name,
        name,
        displayName: name,
        topic: '',
        type: 'public',
        createdBy: 'system',
        createdAt: new Date(),
        memberCount: 0,
        unreadCount: 0,
    }));
}
/** Create initial state */
function createInitialState() {
    return {
        running: true,
        currentChannel: '', // Empty until user actually joins a room
        inputBuffer: '',
        focusedPane: 'input',
        channels: [],
        messages: [],
        members: [],
        typingBuffers: new Map(),
        typingUsers: new Set(),
        prefs: {
            showLogins: true,
            showFileActivity: true,
            showDoorActivity: true,
            showMessages: true,
            showSystemAnnouncements: true,
            muteAllEvents: false,
            compactMode: false,
            showTimestamps: true,
            notificationSound: true,
            mentionSound: true
        },
        lastMessageId: null,
        currentRoomMotd: null,
        dmThreads: [],
        currentDmThread: null,
        muteList: (0, mute_list_1.createMuteList)()
    };
}
/** State mutations */
function setChannel(state, channelId) {
    state.currentChannel = channelId;
    // Switching into a text channel implicitly leaves any DM context so
    // callers can't accidentally have both contexts active simultaneously.
    state.currentDmThread = null;
    state.messages = [];
    state.typingBuffers.clear();
}
/**
 * Switch into a DM thread context.
 *
 * Clears the chat log and any in-progress typing buffers. The caller is
 * responsible for fetching `chat:dm-history` and re-rendering the sidebar
 * to highlight the new active thread.
 *
 * Also clears `currentChannel` so the room:leave guard in handleChannelSelect
 * (`if (state.currentChannel) socket.emit('room:leave')`) doesn't re-emit
 * room:leave on subsequent DM->DM switches.
 */
function setDmContext(state, threadId) {
    state.currentDmThread = threadId;
    state.currentChannel = '';
    state.messages = [];
    state.typingBuffers.clear();
}
/**
 * Leave any DM context and return to the channel-based view. Called when
 * the user clicks a #channel in the sidebar after having been in a DM.
 */
function clearDmContext(state) {
    state.currentDmThread = null;
    state.messages = [];
    state.typingBuffers.clear();
}
function addMessage(state, msg) {
    state.messages.push(msg);
    state.lastMessageId = msg.id;
    if (state.messages.length > 100) {
        state.messages.shift();
    }
}
function clearInput(state) {
    state.inputBuffer = '';
}
function appendInput(state, char) {
    state.inputBuffer += char;
}
function backspaceInput(state) {
    state.inputBuffer = state.inputBuffer.slice(0, -1);
}
