"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatHandlers = setupChatHandlers;
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
        acm(`{cyan-fg}[${d.username} reacted ${d.emoji}]{/cyan-fg}`);
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
    sock.on('chat:dm', (d) => {
        acm(`{magenta-fg}[DM from ${d.from}]: ${d.preview || d.message}{/magenta-fg}`);
        aa(`{magenta-fg}DM from ${d.from}{/magenta-fg}`);
        aud.onDM();
    });
    sock.on('chat:message', (m) => {
        if (m.channelId !== st.currentChannel)
            return;
        if (m.userId === String(uid))
            return;
        am(st, m);
        mh.addMessage(m);
        const im = mu(m.content, un);
        const f = fm(m, un, st.prefs.compactMode);
        acm(f, false);
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
