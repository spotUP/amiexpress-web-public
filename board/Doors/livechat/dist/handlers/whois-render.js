"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOnlineUser = findOnlineUser;
exports.formatWhois = formatWhois;
const door_theme_1 = require("../door-theme");
/**
 * /whois - resolve and render a user's presence inline.
 *
 * The command (`commands/user.ts`) returns `{ type: 'whois', username }` and
 * nothing consumed it, so right-clicking Whois - which submits `/whois <name>`
 * - did nothing. Resolution has to happen where the online-user map lives (the
 * submit handler), because `CommandContext` only knows the CURRENT caller, not
 * the target. These two functions are pure so they are tested the way
 * `dm-render.formatDmLine` is; the handler wires them together.
 */
/** Find an online user by name (a leading `@` is optional), case-insensitive. */
function findOnlineUser(users, name) {
    const want = String(name).replace(/^@/, '').toLowerCase();
    for (const u of users.values()) {
        if (u && typeof u.username === 'string' && u.username.toLowerCase() === want)
            return u;
    }
    return undefined;
}
/**
 * The /whois line - the same facts the profile overlay shows (node, status),
 * rendered inline because a command prints to the log, not a dialog.
 */
function formatWhois(user, name) {
    const who = String(name).replace(/^@/, '');
    if (!user)
        return `{${door_theme_1.T.alert}-fg}User ${who} is not online.{/${door_theme_1.T.alert}-fg}`;
    const node = user.nodeId !== undefined && user.nodeId !== null && user.nodeId !== ''
        ? `Node ${user.nodeId}`
        : 'Node ?';
    const status = user.status === 'idle' ? 'idle' : user.status === 'away' ? 'away' : 'active';
    return `{${door_theme_1.T.accent}-fg}${user.username || who}{/${door_theme_1.T.accent}-fg} - ${node}, ${status}`;
}
