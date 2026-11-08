"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoisRequests = exports.WhoisRequests = void 0;
exports.findOnlineUser = findOnlineUser;
exports.formatWhois = formatWhois;
exports.profileLines = profileLines;
exports.formatProfile = formatProfile;
exports.setProfileSink = setProfileSink;
exports.offerProfile = offerProfile;
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
function day(epochSeconds) {
    const n = Number(epochSeconds);
    return n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : 'never';
}
/** The /whois text for a server profile; the same facts the overlay's extra lines show. */
function profileLines(p) {
    if (!p.found)
        return [`{${door_theme_1.T.alert}-fg}${p.user} is not known to the chat server.{/${door_theme_1.T.alert}-fg}`];
    const online = p.online === '1';
    const status = online ? (p.status || 'online') : 'offline';
    const text = p.statusText ? ` - ${p.statusText}` : '';
    const lines = [
        `{${door_theme_1.T.accent}-fg}${p.nick || p.user}{/${door_theme_1.T.accent}-fg} @${p.board ?? '?'} - ${status}${text}`,
        online
            ? `  idle ${p.idleSeconds || '0'}s, first seen ${day(p.firstSeen)}`
            : `  last seen ${day(p.lastSeen)}, first seen ${day(p.firstSeen)}`,
    ];
    if (p.sharedRooms)
        lines.push(`  shared rooms: ${p.sharedRooms.split(',').length}`);
    return lines;
}
function formatProfile(p) {
    return profileLines(p).join('\n');
}
/**
 * /whois asks the server and waits for chat:profile. A board without the
 * federation never answers, so each request carries a fallback that runs
 * after `ms` unless the reply arrives first.
 */
class WhoisRequests {
    constructor() {
        this.pending = new Map();
    }
    ask(name, fallback, ms = 1500) {
        const k = name.replace(/^@/, '').toLowerCase();
        const old = this.pending.get(k);
        if (old)
            clearTimeout(old);
        this.pending.set(k, setTimeout(() => { this.pending.delete(k); fallback(); }, ms));
    }
    /** The reply arrived: true when a request was waiting for it (fallback cancelled). */
    answer(user) {
        const bare = user.split('@')[0].toLowerCase();
        for (const [k, t] of this.pending) {
            if (k === user.toLowerCase() || k === bare) {
                clearTimeout(t);
                this.pending.delete(k);
                return true;
            }
        }
        return false;
    }
}
exports.WhoisRequests = WhoisRequests;
exports.whoisRequests = new WhoisRequests();
/**
 * The profile overlay claims the next chat:profile reply for its target.
 * Return true from the sink when the reply was consumed (not printed to the log).
 */
let profileSink = null;
function setProfileSink(sink) { profileSink = sink; }
function offerProfile(p) { return profileSink ? profileSink(p) : false; }
