"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMuteList = createMuteList;
exports.toggleMute = toggleMute;
exports.muteLevel = muteLevel;
exports.hidesRoomMessages = hidesRoomMessages;
exports.hidesDirectMessages = hidesDirectMessages;
exports.serializeMuteList = serializeMuteList;
exports.deserializeMuteList = deserializeMuteList;
exports.muteMessage = muteMessage;
exports.muteMenuLabels = muteMenuLabels;
exports.muteLevelForLabel = muteLevelForLabel;
const door_theme_1 = require("../door-theme");
function createMuteList() {
    return new Map();
}
/** Names are compared case-insensitively - "Bob" and "bob" are one person. */
function key(username) {
    // A payload can arrive without a sender name - the live log caught
    // `chat:dm` throwing "Cannot read properties of undefined (reading
    // 'trim')" here, which aborted the handler and lost the message. A
    // nameless sender matches no entry; it must not take the handler down.
    return typeof username === 'string' ? username.trim().toLowerCase() : '';
}
/**
 * Set someone's level, or clear it by passing the level they already have.
 *
 * Toggling on the same level is how the menu unmutes: choosing Mute on
 * someone already muted is the only obvious way back.
 */
function toggleMute(list, username, level) {
    const k = key(username);
    if (!k)
        return null;
    if (list.get(k) === level) {
        list.delete(k);
        return null;
    }
    list.set(k, level);
    return level;
}
function muteLevel(list, username) {
    return list.get(key(username)) ?? null;
}
/** Should a room message from this user be hidden? Every level hides those. */
function hidesRoomMessages(list, username) {
    return muteLevel(list, username) !== null;
}
/** Should a direct message from this user be refused? Mute alone does not. */
function hidesDirectMessages(list, username) {
    const level = muteLevel(list, username);
    return level === 'ignore' || level === 'block';
}
/** The list as something that can be written to prefs and read back. */
function serializeMuteList(list) {
    return Object.fromEntries(list);
}
function deserializeMuteList(saved) {
    const list = createMuteList();
    if (!saved || typeof saved !== 'object')
        return list;
    for (const [name, level] of Object.entries(saved)) {
        if (level === 'mute' || level === 'ignore' || level === 'block') {
            list.set(key(name), level);
        }
    }
    return list;
}
/** What to tell the user, without overstating what actually happened. */
function muteMessage(username, level) {
    if (level === null)
        return `{${door_theme_1.T.accent}-fg}${username} is no longer hidden.{/${door_theme_1.T.accent}-fg}`;
    if (level === 'mute')
        return `{${door_theme_1.T.accent}-fg}Muted ${username} - their room messages are hidden.{/${door_theme_1.T.accent}-fg}`;
    if (level === 'ignore')
        return `{${door_theme_1.T.accent}-fg}Ignoring ${username} - their messages and DMs are hidden.{/${door_theme_1.T.accent}-fg}`;
    // Deliberately not "they cannot contact you": nothing stops them sending.
    return `{${door_theme_1.T.alert}-fg}Blocked ${username} for you - they are hidden everywhere, but the server does not yet stop them sending.{/${door_theme_1.T.alert}-fg}`;
}
/**
 * The labels the user context menu should show for one person.
 *
 * The menu used to list "Mute User", "Ignore" and "Block" from a fixed
 * array that never consulted this list. Muting worked - choosing the same
 * level again lifts it - but nothing on screen said so, so there was no way
 * to tell who was muted and the way back looked exactly like the way in.
 *
 * Only the level actually in force inverts: somebody who is ignored is not
 * also muted, so offering "Unmute" for them would be a lie.
 */
function muteMenuLabels(list, username) {
    const level = muteLevel(list, username);
    return [
        level === 'mute' ? 'Unmute User' : 'Mute User',
        level === 'ignore' ? 'Unignore' : 'Ignore',
        level === 'block' ? 'Unblock' : 'Block',
    ];
}
/** Which mute level a menu label refers to, whether or not it inverts. */
function muteLevelForLabel(label) {
    switch (label) {
        case 'Mute User':
        case 'Unmute User':
            return 'mute';
        case 'Ignore':
        case 'Unignore':
            return 'ignore';
        case 'Block':
        case 'Unblock':
            return 'block';
        default:
            return null;
    }
}
