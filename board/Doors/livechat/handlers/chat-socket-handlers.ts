import { hidesRoomMessages, hidesDirectMessages, applyServerIgnores } from '../core/mute-list';
import { formatReplyQuote } from '../core/reply-quote';
import { applyServerPrefs } from '../core/prefs-sync';
import { formatDmLine } from './dm-render';
import { T } from '../door-theme';
import { setCustomEmojis } from '../utils/emojis';
import { setReactionCounts, formatReactionCounts } from '../features/reaction-store';

export function setupChatHandlers(sock: any, st: any, uid: number, un: string, ou: Map<any, any>, ps: any, cl: any, uut: () => void, asm: (m: string) => void, acm: (m: string, f?: boolean, id?: string) => void, aa: (a: string) => void, uef: (e: string) => void, aud: any, mu: (t: string, u: string) => boolean, guc: (u: string) => string, fm: (m: any, u: string, c: boolean) => string, pk: (b: Map<any, any>, uid: number, un: string, ch: string, c: string) => void, utp: () => void, s: any, sse: (e: any, st: any) => boolean, gem: (e: any) => { msg: string; c: string }, eb: any, am: (st: any, m: any) => void, mh: any, ft: (d: Date) => string, rcl?: () => void) {
  // NOTE: We intentionally do NOT listen to 'ansi-output' - that's raw terminal output
  // for legacy doors. Neo-blessed doors should only use structured events like 'chat:message'.
  // If cross-chat with BBS terminal users is needed, the server should emit proper events.

  sock.on('chat:keystroke', (d: any) => {
    if (d.channelId !== st.currentChannel) return;
    if (String(d.userId) === String(uid)) return;  // Skip own keystrokes
    pk(st.typingBuffers, d.userId, d.username, d.char, guc(d.username));
    utp();
  });

  sock.on('chat:keystroke-submit', (d: any) => {
    if (d.channelId !== st.currentChannel) return;
    if (String(d.userId) === String(uid)) return;  // Skip own submit
    pk(st.typingBuffers, d.userId, d.username, 'SUBMIT', '');
    utp();
  });

  sock.on('chat:keystroke-clear', (d: any) => {
    if (d.channelId !== st.currentChannel) return;
    if (String(d.userId) === String(uid)) return;  // Skip own clear
    pk(st.typingBuffers, d.userId, d.username, 'CLEAR', '');
    utp();
  });

  sock.on('chat:presence', (d: any) => {
    const u = ou.get(String(d.userId));
    if (u) {
      u.status = d.status;
      ps.setStatus(d.userId, d.status, d.custom);
      uut();
      if (d.userId !== uid) {
        if (d.status === 'away') {
          aa(`${u.username} is away`);
        } else if (d.status === 'online') {
          aa(`${u.username} is back`);
        }
      }
    }
  });

  sock.on('chat:reaction', (d: any) => {
    if (d.messageId !== undefined) setReactionCounts(d.messageId, d.counts);
    acm(`{${T.accent}-fg}[${d.username} ${d.action === 'remove' ? 'removed' : 'reacted'} ${d.emoji}]{/${T.accent}-fg}`, false);
    aa(`${d.username}: ${d.emoji}`);
    aud.onReaction();
  });

  // Answer to /reactions <id>.
  sock.on('chat:reactions:list', (d: any) => {
    if (d?.messageId === undefined) return;
    setReactionCounts(d.messageId, d.counts);
    const text = formatReactionCounts(d.messageId).trim();
    asm(text ? `Reactions on ${d.messageId}: ${text}` : `No reactions on ${d.messageId}`);
  });

  sock.on('bbs:event', (e: any) => {
    // Skip Guest activity — pre-login users cycling through FRONTEND/etc
    // spam [EVENT] lines and have no chat identity. Reported 2026-04-24.
    if (e?.username === 'Guest') return;
    // Skip the legacy [EVENT] path for event types already rendered by
    // BBSEventHandler (door_activity, custom_door_event). getEventMessage
    // only knows door_enter/door_exit, so door_activity falls through to
    // the JSON.stringify default and prints "[EVENT] undefined".
    if (e?.type === 'door_activity' || e?.type === 'custom_door_event') return;
    if (!sse(e, st.prefs)) return;
    const { msg, c } = gem(e);
    uef(`{${c}-fg}${msg}{/${c}-fg}`);
    if (e.type === 'user_login' || e.type === 'user_logout') {
      asm(msg);
    }
    eb.emit(e);
    aud.onNotification();
  });

  sock.on('room:motd', (d: any) => {
    st.currentRoomMotd = d?.motd ?? null;
    if (d?.motd) asm(`{${T.accentAlt}-fg}[MOTD] ${d.motd}{/${T.accentAlt}-fg}`);
    else asm(`{${T.accentAlt}-fg}[MOTD] cleared{/${T.accentAlt}-fg}`);
  });

  sock.on('room:invite-received', (d: any) => {
    asm(`{${T.accent}-fg}[INVITE] ${d.from} invited you to ${d.roomName}. Use /join ${d.roomName}{/${T.accent}-fg}`);
  });
  sock.on('room:invited', (d: any) => {
    asm(`Invited ${d.username} to the room`);
  });
  sock.on('room:invite-revoked', (d: any) => {
    asm(`Revoked invite for ${d.username}`);
  });

  sock.on('room:mode', (d: any) => {
    if (!d || !d.applied) return;
    asm(`{${T.accentAlt}-fg}[${d.by || '?'}] set mode ${d.applied}{/${T.accentAlt}-fg}`);
  });

  // The server's ignore list (DB, enforced by the backend) is the truth for
  // the 'ignore' level; ask for it on open and take every reply.
  sock.on('chat:ignore-list', (d: any) => applyServerIgnores(st.muteList, d?.users));
  sock.emit('chat:ignore-list');

  // The user's saved prefs (DB, per user): merged over the defaults on open,
  // then the channel list is redrawn because pins reorder it.
  sock.on('chat:prefs', (d: any) => { if (applyServerPrefs(st.prefs, d?.prefs)) rcl?.(); });
  sock.emit('chat:prefs');

  // Board-wide custom emoji: loaded on open, replaced on every sysop change.
  sock.on('chat:emoji-list', (d: any) => setCustomEmojis(d?.emojis));
  sock.emit('chat:emoji:list');

  sock.on('chat:dm', (d: any) => {
    if (!d) return;

    // Ignored or blocked: their DMs do not reach the user. Mute alone is
    // room-only, so a muted person can still message you directly.
    //
    // This ran BEFORE the guard above and dereferenced `d` to do it, so a
    // payload without a sender threw out of the handler and the DM was never
    // rendered - silently, since the throw was caught upstream by
    // dispatchLocal. That is the reported "/msg does nothing".
    if (hidesDirectMessages(st.muteList, d.from ?? d.username)) return;
    // Backend now persists DMs and echoes the canonical payload back to
    // both sender and recipient. `direction` tells us which side we are.
    // Group DMs (isGroup=true) include a `participants` array.
    acm(formatDmLine(d), false);
    if (d.direction === 'received') {
      aa(`{${T.accent}-fg}${d.isGroup ? 'Group DM' : 'DM'} from ${d.from}{/${T.accent}-fg}`);
      if (typeof aud?.onDM === 'function') aud.onDM();
    }
  });

  sock.on('chat:message', (m: any) => {
    if (m.channelId !== st.currentChannel) return;
    if (m.userId === String(uid)) return;

    // Muted, ignored or blocked: drop it before it reaches the log. The menu
    // used to say "their messages will be hidden" and hide nothing.
    if (hidesRoomMessages(st.muteList, m.username)) return;

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
    if (m.replyTo) acm(formatReplyQuote(m.replyTo), false, m.id);
    acm(f, false, m.id);
    if (im) {
      aa(`{${T.accentAlt}-fg}@${m.username} mentioned you{/${T.accentAlt}-fg}`);
      aud.onMessage(true);
    } else {
      aud.onMessage(false);
    }
    s.render();
  });
}
