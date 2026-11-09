"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatHandlers = setupChatHandlers;
const typing_preview_1 = require("../ui/typing-preview");
const mute_list_1 = require("../core/mute-list");
const reply_quote_1 = require("../core/reply-quote");
const prefs_sync_1 = require("../core/prefs-sync");
const dm_render_1 = require("./dm-render");
const door_theme_1 = require("../door-theme");
const whois_render_1 = require("./whois-render");
const emojis_1 = require("../utils/emojis");
const reaction_store_1 = require("../features/reaction-store");
const reaction_rows_1 = require("../features/reaction-rows");
function setupChatHandlers(sock, st, uid, un, ou, ps, cl, uut, asm, acm, aa, uef, aud, mu, guc, fm, pk, utp, s, sse, gem, eb, am, mh, ft, rcl) {
    // NOTE: We intentionally do NOT listen to 'ansi-output' - that's raw terminal output
    // for legacy doors. Neo-blessed doors should only use structured events like 'chat:message'.
    // If cross-chat with BBS terminal users is needed, the server should emit proper events.
    sock.on('chat:keystroke', (d) => {
        if (d.channelId !== st.currentChannel)
            return;
        if (String(d.userId) === String(uid))
            return; // Skip own keystrokes
        pk(st.typingBuffers, d.userId, d.username, d.char, guc(d.username));
        utp();
    });
    // Whole-buffer typing from the hub (other boards): one call sets the preview.
    sock.on('chat:typing', (d) => {
        if (d.channelId !== st.currentChannel)
            return;
        if (String(d.userId) === String(uid))
            return; // Skip own typing
        (0, typing_preview_1.setTypingBuffer)(st.typingBuffers, d.userId, d.username, String(d.text ?? ''), guc(d.username));
        utp();
    });
    sock.on('chat:keystroke-submit', (d) => {
        if (d.channelId !== st.currentChannel)
            return;
        if (String(d.userId) === String(uid))
            return; // Skip own submit
        pk(st.typingBuffers, d.userId, d.username, 'SUBMIT', '');
        utp();
    });
    sock.on('chat:keystroke-clear', (d) => {
        if (d.channelId !== st.currentChannel)
            return;
        if (String(d.userId) === String(uid))
            return; // Skip own clear
        pk(st.typingBuffers, d.userId, d.username, 'CLEAR', '');
        utp();
    });
    // Server profile (federation door server): answer to /whois and View Profile.
    sock.on('chat:profile', (d) => {
        if ((0, whois_render_1.offerProfile)(d))
            return;
        whois_render_1.whoisRequests.answer(String(d?.user ?? ''));
        for (const line of (0, whois_render_1.profileLines)(d))
            asm(line);
    });
    sock.on('chat:presence', (d) => {
        // A federated userId is the handle, which the roster may not key by:
        // fall back to the name, and add a person who first shows up as a presence.
        let u = ou.get(String(d.userId)) ?? (0, whois_render_1.findOnlineUser)(ou, String(d.username ?? ''));
        if (!u && d.username && d.userId !== uid) {
            u = { username: d.username, status: d.status, joinedAt: new Date() };
            ou.set(String(d.userId), u);
        }
        if (u) {
            u.status = d.status;
            ps.setStatus(d.userId, d.status, d.custom);
            uut();
            if (d.userId !== uid) {
                if (d.status === 'away') {
                    aa(`${u.username} is away`);
                }
                else if (d.status === 'online') {
                    aa(`${u.username} is back`);
                }
            }
        }
    });
    sock.on('chat:reaction', (d) => {
        if (d.messageId !== undefined)
            (0, reaction_store_1.setReactionCounts)(d.messageId, d.counts);
        acm(`{${door_theme_1.T.accent}-fg}[${d.username} ${d.action === 'remove' ? 'removed' : 'reacted'} ${d.emoji}]{/${door_theme_1.T.accent}-fg}`, false);
        aa(`${d.username}: ${d.emoji}`);
        aud.onReaction();
    });
    // Answer to /reactions <id>.
    sock.on('chat:reactions:list', (d) => {
        if (d?.messageId === undefined)
            return;
        (0, reaction_store_1.setReactionCounts)(d.messageId, d.counts);
        const text = (0, reaction_rows_1.formatReactionCounts)(d.messageId).trim();
        asm(text ? `Reactions on ${d.messageId}: ${text}` : `No reactions on ${d.messageId}`);
    });
    sock.on('bbs:event', (e) => {
        // Skip Guest activity — pre-login users cycling through FRONTEND/etc
        // spam [EVENT] lines and have no chat identity. Reported 2026-04-24.
        if (e?.username === 'Guest')
            return;
        // Skip the legacy [EVENT] path for event types already rendered by
        // BBSEventHandler (door_activity, custom_door_event). getEventMessage
        // only knows door_enter/door_exit, so door_activity falls through to
        // the JSON.stringify default and prints "[EVENT] undefined".
        if (e?.type === 'door_activity' || e?.type === 'custom_door_event')
            return;
        if (!sse(e, st.prefs))
            return;
        const { msg, c } = gem(e);
        uef(`{${c}-fg}${msg}{/${c}-fg}`);
        if (e.type === 'user_login' || e.type === 'user_logout') {
            asm(msg);
        }
        eb.emit(e);
        aud.onNotification();
    });
    sock.on('room:motd', (d) => {
        st.currentRoomMotd = d?.motd ?? null;
        if (d?.motd)
            asm(`{${door_theme_1.T.accentAlt}-fg}[MOTD] ${d.motd}{/${door_theme_1.T.accentAlt}-fg}`);
        else
            asm(`{${door_theme_1.T.accentAlt}-fg}[MOTD] cleared{/${door_theme_1.T.accentAlt}-fg}`);
    });
    sock.on('room:invite-received', (d) => {
        asm(`{${door_theme_1.T.accent}-fg}[INVITE] ${d.from} invited you to ${d.roomName}. Use /join ${d.roomName}{/${door_theme_1.T.accent}-fg}`);
    });
    sock.on('room:invited', (d) => {
        asm(`Invited ${d.username} to the room`);
    });
    sock.on('room:invite-revoked', (d) => {
        asm(`Revoked invite for ${d.username}`);
    });
    sock.on('room:mode', (d) => {
        if (!d || !d.applied)
            return;
        asm(`{${door_theme_1.T.accentAlt}-fg}[${d.by || '?'}] set mode ${d.applied}{/${door_theme_1.T.accentAlt}-fg}`);
    });
    // The server's ignore list (DB, enforced by the backend) is the truth for
    // the 'ignore' level; ask for it on open and take every reply.
    sock.on('chat:ignore-list', (d) => (0, mute_list_1.applyServerIgnores)(st.muteList, d?.users));
    sock.emit('chat:ignore-list');
    // The user's saved prefs (DB, per user): merged over the defaults on open,
    // then the channel list is redrawn because pins reorder it.
    sock.on('chat:prefs', (d) => { if ((0, prefs_sync_1.applyServerPrefs)(st.prefs, d?.prefs))
        rcl?.(); });
    sock.emit('chat:prefs');
    // Board-wide custom emoji: loaded on open, replaced on every sysop change.
    sock.on('chat:emoji-list', (d) => (0, emojis_1.setCustomEmojis)(d?.emojis));
    sock.emit('chat:emoji:list');
    sock.on('chat:dm', (d) => {
        if (!d)
            return;
        // Ignored or blocked: their DMs do not reach the user. Mute alone is
        // room-only, so a muted person can still message you directly.
        //
        // This ran BEFORE the guard above and dereferenced `d` to do it, so a
        // payload without a sender threw out of the handler and the DM was never
        // rendered - silently, since the throw was caught upstream by
        // dispatchLocal. That is the reported "/msg does nothing".
        if ((0, mute_list_1.hidesDirectMessages)(st.muteList, d.from ?? d.username))
            return;
        // Backend now persists DMs and echoes the canonical payload back to
        // both sender and recipient. `direction` tells us which side we are.
        // Group DMs (isGroup=true) include a `participants` array.
        acm((0, dm_render_1.formatDmLine)(d), false);
        if (d.direction === 'received') {
            aa(`{${door_theme_1.T.accent}-fg}${d.isGroup ? 'Group DM' : 'DM'} from ${d.from}{/${door_theme_1.T.accent}-fg}`);
            if (typeof aud?.onDM === 'function')
                aud.onDM();
        }
    });
    sock.on('chat:message', (m) => {
        if (m.channelId !== st.currentChannel)
            return;
        if (m.userId === String(uid))
            return;
        // Muted, ignored or blocked: drop it before it reaches the log. The menu
        // used to say "their messages will be hidden" and hide nothing.
        if ((0, mute_list_1.hidesRoomMessages)(st.muteList, m.username))
            return;
        // Their typing preview is finished with: a delivered message IS the text
        // that preview was showing. This used to rest entirely on a separate
        // chat:keystroke-submit signal arriving first, and when it did not, the
        // preview stayed on screen next to the delivered line - the same message
        // twice, in two formats, reported live with two users typing at once.
        // The message itself is the authority, so reconcile against it.
        pk(st.typingBuffers, m.userId, m.username, 'SUBMIT', '');
        utp();
        am(st, m);
        mh.addMessage(m);
        const im = mu(m.content, un);
        const f = fm(m, un, st.prefs.compactMode);
        // The id travels with the line, so a right-click on it can name the
        // message - see chat-row-map.
        if (m.replyTo)
            acm((0, reply_quote_1.formatReplyQuote)(m.replyTo), false, m.id);
        acm(f, false, m.id);
        if (im) {
            aa(`{${door_theme_1.T.accentAlt}-fg}@${m.username} mentioned you{/${door_theme_1.T.accentAlt}-fg}`);
            aud.onMessage(true);
        }
        else {
            aud.onMessage(false);
        }
        s.render();
    });
}
