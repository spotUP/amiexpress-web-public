"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatHandlers = setupChatHandlers;
const mute_list_1 = require("../core/mute-list");
const dm_render_1 = require("./dm-render");
function setupChatHandlers(sock, st, uid, un, ou, ps, cl, uut, asm, acm, aa, uef, aud, mu, guc, fm, pk, utp, s, sse, gem, eb, am, mh, ft) {
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
    sock.on('chat:presence', (d) => {
        const u = ou.get(String(d.userId));
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
        acm(`{cyan-fg}[${d.username} reacted ${d.emoji}]{/cyan-fg}`, false);
        aa(`${d.username}: ${d.emoji}`);
        aud.onReaction();
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
            asm(`{yellow-fg}[MOTD] ${d.motd}{/yellow-fg}`);
        else
            asm('{yellow-fg}[MOTD] cleared{/yellow-fg}');
    });
    sock.on('room:invite-received', (d) => {
        asm(`{cyan-fg}[INVITE] ${d.from} invited you to ${d.roomName}. Use /join ${d.roomName}{/cyan-fg}`);
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
        asm(`{yellow-fg}[${d.by || '?'}] set mode ${d.applied}{/yellow-fg}`);
    });
    sock.on('chat:dm', (d) => {
        // Ignored or blocked: their DMs do not reach the user. Mute alone is
        // room-only, so a muted person can still message you directly.
        if ((0, mute_list_1.hidesDirectMessages)(st.muteList, d.from ?? d.username))
            return;
        if (!d)
            return;
        // Backend now persists DMs and echoes the canonical payload back to
        // both sender and recipient. `direction` tells us which side we are.
        // Group DMs (isGroup=true) include a `participants` array.
        acm((0, dm_render_1.formatDmLine)(d), false);
        if (d.direction === 'received') {
            aa(`{cyan-fg}${d.isGroup ? 'Group DM' : 'DM'} from ${d.from}{/cyan-fg}`);
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
        acm(f, false, m.id);
        if (im) {
            aa(`{yellow-fg}@${m.username} mentioned you{/yellow-fg}`);
            aud.onMessage(true);
        }
        else {
            aud.onMessage(false);
        }
        s.render();
    });
    sock.on('chat:edited', (d) => {
        const t = ft(new Date(d.timestamp));
        const c = guc(d.username);
        acm(`{gray-fg}[${t}]{/gray-fg} <{${c}-fg}${d.username}{/${c}-fg}> ${d.newText} {gray-fg}(edited){/gray-fg}`);
        s.render();
    });
}
