/**
 * Bridge from the board's in-process livechat socket events to the door
 * server's /chat/v1 service ("federated" chat).
 *
 * ONE entry, `handleFederatedChatEvent(socket, session, event, data)`, used by
 * the two places a livechat event enters the board:
 *   - the real socket handlers (server/socket-guard.ts onCaller, through the
 *     legacy gate), and
 *   - createDoorSocketWrapper (handlers/door.handler.ts), which intercepts
 *     the room:* / chat:* emits a TypeScript door makes.
 * It returns true when it consumed the event. With `livechat_federated` off
 * it returns false at once and today's in-process path runs unchanged.
 *
 * Each logged-on caller gets one chat session (lazily, on first use) and one
 * long-poll loop. Events from the poll are delivered to THAT caller on both
 * output paths of the in-process broadcast: raw ANSI (`ansi-output`) for
 * telnet and SSH callers unless a door owns the terminal, and the structured
 * `chat:message` for web and door clients. A caller's own lines are not
 * echoed back, as the in-process path excludes the sender.
 */
import type { SystemConfig } from '../../database/types';
import type { BBSSession } from '../../index';
import { emitterForSession } from '../../server/session-emitter-registry';
import { doorOwnsTerminal } from '../../utils/door-owns-terminal';
import { sanitizeChatMessage } from '../../handlers/chat/sanitize-message';
import { ChatApiError, ChatClient, chatTarget } from './chat-client';
import type { ChatTextReply } from './chat-client';
import { renderMessageLine, renderSystemLine, splitSubFields } from './ansi-render';

interface Deps {
  getConfig: () => SystemConfig | null;
  io?: unknown;
  /** Seconds a poll is held; the door server caps it at 25. */
  pollWaitSeconds?: number;
}

let deps: Deps = { getConfig: () => null };

export function setChatFederationDependencies(d: Deps): void {
  deps = d;
}

/** Events this bridge takes over when federation is on. */
export const FEDERATED_EVENTS: ReadonlySet<string> = new Set([
  'room:join',
  'room:leave',
  'room:message',
  'room:list',
  'room:create',
  'room:topic',
  'room:kick',
  'chat:edit',
  'chat:delete',
  'chat:react',
  'chat:unreact',
  'chat:dm',
  'chat:presence',
  'chat:whois',
  'chat:ignore',
  'chat:unignore',
  'chat:ignore-list',
]);

export function isFederatedEnabled(): boolean {
  const cfg = deps.getConfig();
  return Boolean(cfg?.livechat_federated) && chatTarget(cfg) !== null;
}

interface CallerState {
  client: ChatClient;
  sid: string | null;
  handle: string;
  roomId: string | null;
  roomName: string;
  since: number;
  polling: boolean;
  closed: boolean;
  counter: number;
}

const states = new WeakMap<BBSSession, CallerState>();
const open = new Set<CallerState>();

type Emitter = { emit: (event: string, ...args: unknown[]) => unknown };

function out(session: BBSSession): Emitter | null {
  return emitterForSession(session, deps.io as never) as Emitter | null;
}

function sysopLevel(session: BBSSession): boolean {
  return Number((session.user as { secLevel?: unknown } | undefined)?.secLevel ?? 0) >= 255;
}

async function stateFor(session: BBSSession): Promise<CallerState> {
  let st = states.get(session);
  const target = chatTarget(deps.getConfig());
  if (!target) throw new Error('chat federation is not configured');
  if (!st) {
    const handle = String((session.user as { username?: unknown } | undefined)?.username ?? '');
    st = {
      client: new ChatClient(target),
      sid: null,
      handle,
      roomId: null,
      roomName: '',
      since: 0,
      polling: false,
      closed: false,
      counter: 0,
    };
    states.set(session, st);
    open.add(st);
  }
  if (!st.sid) {
    const reply = await st.client.openSession(st.handle, sysopLevel(session));
    st.sid = reply.sid;
    st.handle = reply.user || st.handle;
  }
  return st;
}

async function withSession<T>(session: BBSSession, run: (st: CallerState, sid: string) => Promise<T>): Promise<T> {
  const st = await stateFor(session);
  try {
    return await run(st, st.sid as string);
  } catch (err) {
    if (err instanceof ChatApiError && err.code === 'session_expired') {
      st.sid = null;
      const fresh = await stateFor(session);
      if (fresh.roomId) await fresh.client.join(fresh.sid as string, fresh.roomId);
      return run(fresh, fresh.sid as string);
    }
    throw err;
  }
}

function toMs(at: number): number {
  return at < 1e12 ? at * 1000 : at;
}

function deliver(session: BBSSession, st: CallerState, rows: ChatTextReply['rows']): void {
  const emitter = out(session);
  if (!emitter) return;
  const ansiOk = !doorOwnsTerminal(session);
  const own = st.handle.toLowerCase();
  for (const r of rows) {
    const at = Number(r.at) || Math.floor(Date.now() / 1000);
    if (r.type === 'message' || r.type === 'dm') {
      if (r.user.toLowerCase() === own) continue;
      if (ansiOk) emitter.emit('ansi-output', renderMessageLine(r.user, r.roleColor, r.text, at));
      emitter.emit('chat:message', {
        id: r.ref,
        channelId: r.room,
        userId: r.user,
        username: r.user,
        content: r.text,
        type: r.type === 'dm' ? 'dm' : 'message',
        roleColor: r.roleColor,
        createdAt: new Date(toMs(at)),
      });
      continue;
    }
    if (r.type === 'presence') {
      // text is `status!statusText` (the wire form of a pipe is `!`)
      if (r.user.toLowerCase() === own) continue;
      const [status = 'online', ...rest] = splitSubFields(r.text);
      emitter.emit('chat:presence', {
        userId: r.user,
        username: r.user,
        status,
        custom: rest.join('!') || undefined,
      });
      continue;
    }
    const line = systemText(r);
    if (line === null) continue;
    if (ansiOk) emitter.emit('ansi-output', renderSystemLine(line));
    emitter.emit('chat:message', { type: 'system', channelId: r.room, message: line, createdAt: new Date(toMs(at)) });
  }
}

function systemText(r: Record<string, string>): string | null {
  const f = splitSubFields(r.text);
  switch (r.type) {
    case 'joined':
      return `${r.user} has joined`;
    case 'left':
      return `${r.user} has left`;
    case 'topic':
      return `${r.user} set the topic: ${r.text}`;
    case 'kicked':
      return `${r.user} was kicked by ${f[0] ?? ''}`;
    case 'banned':
      return `${r.user} was banned by ${f[0] ?? ''}${f[1] ? `: ${f[1]}` : ''}`;
    case 'muted':
      return `${r.user} was muted by ${f[0] ?? ''}${f[1] ? ` for ${f[1]} minutes` : ''}`;
    case 'unmuted':
      return `${r.user} was unmuted by ${f[0] ?? ''}`;
    case 'op':
      return `${r.user} is now an operator`;
    case 'deop':
      return `${r.user} is no longer an operator`;
    case 'motd':
      return r.text;
    default:
      return null;
  }
}

async function pollLoop(session: BBSSession, st: CallerState): Promise<void> {
  if (st.polling) return;
  st.polling = true;
  try {
    while (!st.closed && st.sid) {
      try {
        const reply = await st.client.events(st.sid, st.since, deps.pollWaitSeconds ?? 20);
        st.since = reply.rev;
        if (reply.rows.length > 0) deliver(session, st, reply.rows);
      } catch (err) {
        if (st.closed) break;
        if (err instanceof ChatApiError && err.code === 'session_expired') {
          st.sid = null;
          await stateFor(session);
          const fresh = st.sid;
          if (st.roomId && fresh) await st.client.join(fresh, st.roomId);
          continue;
        }
        const wait = err instanceof ChatApiError && err.retryAfter ? err.retryAfter * 1000 : 3000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  } finally {
    st.polling = false;
  }
}

/** End a caller's chat session (logoff, disconnect). Safe to call when none exists. */
export async function closeFederatedChat(session: BBSSession): Promise<void> {
  const st = states.get(session);
  if (!st) return;
  st.closed = true;
  open.delete(st);
  states.delete(session);
  const sid = st.sid;
  st.sid = null;
  if (sid) await st.client.closeSession(sid).catch(() => undefined);
}

/** Test and shutdown helper: close every open caller. */
export async function closeAllFederatedChats(): Promise<void> {
  const all = [...open];
  open.clear();
  await Promise.all(
    all.map(async (st) => {
      st.closed = true;
      const sid = st.sid;
      st.sid = null;
      if (sid) await st.client.closeSession(sid).catch(() => undefined);
    }),
  );
}

interface Payload {
  roomId?: string;
  roomName?: string;
  room?: string;
  message?: string;
  content?: string;
  topic?: string;
  messageId?: string;
  id?: string;
  emoji?: string;
  targetUsername?: string;
  to?: string;
  clientId?: string;
  status?: string;
  custom?: string;
  user?: string;
  username?: string;
  isPublic?: boolean;
}

async function resolveRoom(st: CallerState, sid: string, p: Payload): Promise<string> {
  const want = (p.roomId ?? p.roomName ?? p.room ?? '').trim();
  if (!want) throw new Error('no room named');
  const rooms = (await st.client.rooms(sid)).rows;
  const hit = rooms.find((r) => r.id === want || r.name.toLowerCase() === want.toLowerCase());
  if (hit) return hit.id;
  const made = await st.client.createRoom(sid, want, undefined, p.isPublic === false ? 'private' : 'public');
  return made.id;
}

async function dispatch(socket: { emit: (e: string, ...a: unknown[]) => unknown }, session: BBSSession, event: string, p: Payload): Promise<void> {
  await withSession(session, async (st, sid) => {
    const messageId = p.messageId ?? p.id ?? '';
    switch (event) {
      case 'room:join': {
        const id = await resolveRoom(st, sid, p);
        const joined = await st.client.join(sid, id);
        st.roomId = joined.id;
        st.roomName = joined.name;
        st.since = joined.since;
        const history = (await st.client.history(sid, joined.id)).rows;
        socket.emit('room:joined', {
          roomId: joined.id,
          roomName: joined.name,
          topic: joined.topic,
          memberCount: joined.members,
          messages: history.map((h) => ({
            id: h.id,
            channelId: joined.id,
            username: h.user,
            userId: h.user,
            content: h.text,
            roleColor: h.roleColor,
            type: 'message',
            createdAt: new Date(toMs(Number(h.at))),
          })),
        });
        void pollLoop(session, st);
        return;
      }
      case 'room:leave':
        if (st.roomId) await st.client.leave(sid, st.roomId);
        st.roomId = null;
        socket.emit('room:left', {});
        return;
      case 'room:message': {
        if (!st.roomId) throw new Error('not in a room');
        const text = sanitizeChatMessage(p.message ?? p.content ?? '');
        if (!text) return;
        st.counter += 1;
        await st.client.post(sid, st.roomId, text, p.clientId ?? `${st.handle}-${Date.now()}-${st.counter}`);
        return;
      }
      case 'room:list': {
        const rows = (await st.client.rooms(sid)).rows;
        socket.emit('room:list', {
          rooms: rows.map((r) => ({
            id: r.id,
            name: r.name,
            topic: r.topic,
            isPublic: r.visibility === 'public',
            memberCount: Number(r.members) || 0,
            owner: r.owner,
          })),
        });
        return;
      }
      case 'room:create': {
        const name = (p.roomName ?? p.room ?? '').trim();
        const made = await st.client.createRoom(sid, name, p.topic, p.isPublic === false ? 'private' : 'public');
        socket.emit('room:created', { roomId: made.id, roomName: made.name });
        return;
      }
      case 'room:topic':
        if (st.roomId) await st.client.setTopic(sid, p.roomId ?? st.roomId, p.topic ?? '');
        return;
      case 'room:kick':
        if (st.roomId && p.targetUsername) await st.client.moderate(sid, st.roomId, 'kick', p.targetUsername);
        return;
      case 'chat:edit':
        await st.client.edit(sid, messageId, sanitizeChatMessage(p.content ?? p.message ?? ''));
        return;
      case 'chat:delete':
        await st.client.remove(sid, messageId);
        return;
      case 'chat:react':
        await st.client.react(sid, messageId, p.emoji ?? '');
        return;
      case 'chat:unreact':
        await st.client.unreact(sid, messageId, p.emoji ?? '');
        return;
      case 'chat:dm':
        st.counter += 1;
        await st.client.dm(sid, p.to ?? '', sanitizeChatMessage(p.message ?? p.content ?? ''), `${st.handle}-dm-${Date.now()}-${st.counter}`);
        return;
      case 'chat:presence': {
        const status = p.status;
        if (status !== 'online' && status !== 'away' && status !== 'busy' && status !== 'dnd') return;
        const text = (p.custom ?? '').trim();
        if (status === 'online' && !text) await st.client.clearPresence(sid);
        else await st.client.setPresence(sid, status, text || undefined);
        return;
      }
      case 'chat:whois': {
        const user = fullHandle(st, p.username ?? p.user ?? '');
        try {
          const row = (await st.client.profile(sid, user)).rows[0];
          socket.emit('chat:profile', row ? { found: true, ...row } : { found: false, user });
        } catch (err) {
          if (err instanceof ChatApiError && err.code === 'not_found') socket.emit('chat:profile', { found: false, user });
          else throw err;
        }
        return;
      }
      case 'chat:ignore':
      case 'chat:unignore': {
        const user = fullHandle(st, p.user ?? '');
        if (user && user.toLowerCase() !== st.handle.toLowerCase()) {
          if (event === 'chat:ignore') await st.client.ignore(sid, user);
          else await st.client.unignore(sid, user);
        }
        await emitIgnoreList(socket, st, sid);
        return;
      }
      case 'chat:ignore-list':
        await emitIgnoreList(socket, st, sid);
        return;
      default:
        return;
    }
  });
}

/** A bare name means someone on the caller's own board: `bob` becomes `bob@<this board>`. */
function fullHandle(st: CallerState, name: string): string {
  const n = name.trim().replace(/^@/, '');
  if (!n || n.includes('@')) return n;
  const board = st.handle.split('@')[1];
  return board ? `${n}@${board}` : n;
}

async function emitIgnoreList(socket: { emit: (e: string, ...a: unknown[]) => unknown }, st: CallerState, sid: string): Promise<void> {
  const rows = (await st.client.ignores(sid)).rows;
  socket.emit('chat:ignore-list', { users: rows.map((r) => r.user) });
}

/**
 * The single entry. True = consumed (federated on and the event is one this
 * bridge owns); false = the caller runs the in-process handler as before.
 */
export function handleFederatedChatEvent(
  socket: { emit: (event: string, ...args: unknown[]) => unknown },
  session: BBSSession,
  event: string,
  data: unknown,
): boolean {
  if (!FEDERATED_EVENTS.has(event) || !isFederatedEnabled()) return false;
  const payload = (data && typeof data === 'object' ? data : {}) as Payload;
  dispatch(socket, session, event, payload).catch((err: unknown) => {
    const message = err instanceof ChatApiError ? err.detail || err.code : err instanceof Error ? err.message : 'chat failed';
    socket.emit('room:error', { error: message });
  });
  return true;
}
