/**
 * HTTP client for the door server's /chat/v1 service.
 *
 * One method per endpoint the board uses. The board key goes in the
 * `Authorization: Board <key>` header, the caller's chat session in
 * `X-Chat-Session`. The key is read from system_config through
 * achievementsSettings (same three homes as the achievements reporter), so a
 * board that already reports achievements needs no second key.
 *
 * Text endpoints (`*.txt`) answer `FORMAT|1|<rev>|<count>` then CRLF rows
 * split on `|`; a literal pipe inside a field is already `!` on the wire, so
 * no unescape step exists. The last column of a row is free text and may
 * contain `|` only if the server escaped it, so rows split on every pipe.
 */
import * as http from 'http';
import * as https from 'https';
import type { SystemConfig } from '../../database/types';
import { achievementsSettings } from '../../achievements/config';

export interface ChatRolePerms {
  kick: boolean;
  ban: boolean;
  mute: boolean;
  topic: boolean;
  createPrivate: boolean;
}
export interface ChatRoleRow {
  id: string;
  name: string;
  colorHex: string;
  colorAnsi: number;
  position: number;
  perms: ChatRolePerms;
}
export interface ChatRoleInput {
  name: string;
  colorHex: string;
  colorAnsi: number;
  position?: number;
  perms?: Partial<ChatRolePerms>;
}
export interface ChatRoleAssignment {
  handle: string;
  roleId: string;
}
export interface ChatSessionReply {
  sid: string;
  user: string;
  expiresIn: number;
}
export interface ChatJoinReply {
  id: string;
  name: string;
  topic: string;
  members: number;
  ops: string[];
  since: number;
}
export interface ChatPostReply {
  id: string;
  seq: number;
  at: number;
}

/** A parsed text reply: header revision (the next `since`) and rows keyed by column name. */
export interface ChatTextReply {
  format: string;
  rev: number;
  rows: Array<Record<string, string>>;
}

export const CHAT_TEXT_COLUMNS = {
  ROOMS: ['id', 'name', 'topic', 'visibility', 'members', 'owner'],
  MEMBERS: ['user', 'sysop', 'op', 'roleColor', 'roleName', 'status', 'statusText'],
  HISTORY: ['seq', 'id', 'user', 'at', 'replyTo', 'threadId', 'roleColor', 'text'],
  EVENTS: ['seq', 'type', 'room', 'user', 'ref', 'at', 'roleColor', 'text', 'replyTo'],
  REACTIONS: ['emoji', 'count', 'mine'],
  WHO: ['user', 'room', 'sysop', 'roleColor', 'idleSeconds', 'status', 'statusText'],
  DM: ['threadId', 'peer', 'lastAt', 'unread'],
  PROFILE: ['user', 'nick', 'board', 'status', 'statusText', 'firstSeen', 'lastSeen', 'idleSeconds', 'online', 'sharedRooms'],
  IGNORES: ['user', 'at'],
} as const;

export class ChatApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail: string,
    public readonly retryAfter?: number,
  ) {
    super(`chat ${status} ${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'ChatApiError';
  }
}

export interface ChatClientTarget {
  serverUrl: string;
  boardKey: string;
}

/** The target for this board: env DOOR_SERVER_URL wins over the stored address. */
export function chatTarget(cfg: SystemConfig | null | undefined): ChatClientTarget | null {
  const s = achievementsSettings(cfg);
  const envUrl = (process.env.DOOR_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const serverUrl = envUrl !== '' ? envUrl : s.serverUrl;
  if (serverUrl === '' || s.boardKey === '') return null;
  return { serverUrl, boardKey: s.boardKey };
}

/** Parse a `FORMAT|1|rev|count` reply. Throws when the header names another format. */
export function parseTextRows(
  body: string,
  format: keyof typeof CHAT_TEXT_COLUMNS,
): ChatTextReply {
  const lines = body.split(/\r?\n/).filter((l) => l !== '');
  const header = (lines[0] ?? '').split('|');
  if (header[0] !== format) throw new Error(`chat text: expected ${format}, got ${header[0] ?? ''}`);
  const cols = CHAT_TEXT_COLUMNS[format];
  const rows = lines.slice(1).map((line) => {
    const f = line.split('|');
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      row[c] = f[i] ?? '';
    });
    return row;
  });
  return { format, rev: Number(header[2] ?? 0) || 0, rows };
}

interface RawReply {
  status: number;
  body: string;
  retryAfterHeader?: string;
}

export class ChatClient {
  constructor(private readonly target: ChatClientTarget) {}

  private raw(
    method: string,
    path: string,
    sid: string | null,
    body?: unknown,
    timeoutMs = 10000,
  ): Promise<RawReply> {
    return new Promise((resolve, reject) => {
      const url = new URL(`/chat/v1${path}`, this.target.serverUrl);
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = {
        Authorization: `Board ${this.target.boardKey}`,
        Connection: 'close',
      };
      if (sid) headers['X-Chat-Session'] = sid;
      if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(url, { method, headers, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('latin1'),
            retryAfterHeader: res.headers['retry-after']?.toString(),
          }),
        );
      });
      req.on('timeout', () => req.destroy(new Error('chat request timed out')));
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }

  private fail(r: RawReply): never {
    let code = 'internal_error';
    let detail = '';
    let retryAfter: number | undefined = r.retryAfterHeader ? Number(r.retryAfterHeader) : undefined;
    try {
      const j = JSON.parse(r.body) as { error?: string; detail?: string; retryAfter?: number };
      code = j.error ?? code;
      detail = j.detail ?? '';
      if (typeof j.retryAfter === 'number') retryAfter = j.retryAfter;
    } catch {
      /* non-JSON error body: keep defaults */
    }
    throw new ChatApiError(r.status, code, detail, retryAfter);
  }

  private async json<T>(method: string, path: string, sid: string | null, body?: unknown): Promise<T> {
    const r = await this.raw(method, path, sid, body);
    if (r.status < 200 || r.status >= 300) this.fail(r);
    return (r.body === '' ? undefined : JSON.parse(r.body)) as T;
  }

  private async text(
    path: string,
    sid: string | null,
    format: keyof typeof CHAT_TEXT_COLUMNS,
    timeoutMs?: number,
  ): Promise<ChatTextReply> {
    const r = await this.raw('GET', path, sid, undefined, timeoutMs);
    if (r.status < 200 || r.status >= 300) this.fail(r);
    return parseTextRows(r.body, format);
  }

  /** Relay one of this board's BBS events (POST /bbs-events); only this board's chat sessions see it. */
  async relayBbsEvent(event: { type: string; username: string; nodeId: number; data?: Record<string, unknown> }): Promise<void> {
    await this.json('POST', '/bbs-events', null, event);
  }
  openSession(handle: string, sysop: boolean, client = 'amiexpress-web'): Promise<ChatSessionReply> {
    return this.json('POST', '/sessions', null, { handle, sysop, client });
  }
  async closeSession(sid: string): Promise<void> {
    await this.json('DELETE', '/sessions/current', sid);
  }
  rooms(sid: string, mine = false): Promise<ChatTextReply> {
    return this.text(`/rooms.txt${mine ? '?mine=1' : ''}`, sid, 'ROOMS');
  }
  createRoom(sid: string, name: string, topic?: string, visibility?: 'public' | 'private') {
    return this.json<{ id: string; name: string; visibility: string }>('POST', '/rooms', sid, {
      name,
      topic,
      visibility,
    });
  }
  join(sid: string, roomId: string): Promise<ChatJoinReply> {
    return this.json('POST', `/rooms/${encodeURIComponent(roomId)}/join`, sid);
  }
  async leave(sid: string, roomId: string): Promise<void> {
    await this.json('POST', `/rooms/${encodeURIComponent(roomId)}/leave`, sid);
  }
  members(sid: string, roomId: string): Promise<ChatTextReply> {
    return this.text(`/rooms/${encodeURIComponent(roomId)}/members.txt`, sid, 'MEMBERS');
  }
  history(sid: string, roomId: string, limit = 20): Promise<ChatTextReply> {
    return this.text(`/rooms/${encodeURIComponent(roomId)}/history.txt?limit=${limit}`, sid, 'HISTORY');
  }
  post(sid: string, roomId: string, content: string, clientId: string): Promise<ChatPostReply> {
    return this.json('POST', `/rooms/${encodeURIComponent(roomId)}/messages`, sid, { content, clientId });
  }
  edit(sid: string, messageId: string, content: string) {
    return this.json<{ id: string; seq: number }>('PUT', `/messages/${encodeURIComponent(messageId)}`, sid, {
      content,
    });
  }
  async remove(sid: string, messageId: string): Promise<void> {
    await this.json('DELETE', `/messages/${encodeURIComponent(messageId)}`, sid);
  }
  react(sid: string, messageId: string, emoji: string) {
    return this.json<{ count: number }>('POST', `/messages/${encodeURIComponent(messageId)}/react`, sid, { emoji });
  }
  unreact(sid: string, messageId: string, emoji: string) {
    return this.json<{ count: number }>(
      'DELETE',
      `/messages/${encodeURIComponent(messageId)}/react/${encodeURIComponent(emoji)}`,
      sid,
    );
  }
  thread(sid: string, parentId: string, content: string, clientId: string): Promise<ChatPostReply> {
    return this.json('POST', `/messages/${encodeURIComponent(parentId)}/thread`, sid, { content, clientId });
  }
  dm(sid: string, peer: string, content: string, clientId: string) {
    return this.json<{ id: string; seq: number; threadId: string }>(
      'POST',
      `/dm/${encodeURIComponent(peer)}`,
      sid,
      { content, clientId },
    );
  }
  who(sid: string): Promise<ChatTextReply> {
    return this.text('/who.txt', sid, 'WHO');
  }
  /** /away, /status: online with no text is the same as clearing. */
  setPresence(sid: string, status: 'online' | 'away' | 'busy' | 'dnd', text?: string) {
    return this.json<{ status: string; statusText: string }>('PUT', '/presence', sid, { status, text });
  }
  /** /back. */
  clearPresence(sid: string) {
    return this.json<{ status: string; statusText: string }>('DELETE', '/presence', sid);
  }
  /** One PROFILE row for `handle@BOARD`; 404 not_found when the server never saw the user. */
  profile(sid: string, user: string): Promise<ChatTextReply> {
    return this.text(`/users/${encodeURIComponent(user)}/profile.txt`, sid, 'PROFILE');
  }
  ignores(sid: string): Promise<ChatTextReply> {
    return this.text('/ignores.txt', sid, 'IGNORES');
  }
  async ignore(sid: string, user: string): Promise<void> {
    await this.json('POST', '/ignores', sid, { user });
  }
  async unignore(sid: string, user: string): Promise<void> {
    await this.json('DELETE', `/ignores/${encodeURIComponent(user)}`, sid);
  }
  /** Long poll. Returns rows after `since`; `rev` is the next `since`. */
  events(sid: string, since: number, waitSeconds = 20): Promise<ChatTextReply> {
    return this.text(`/events.txt?since=${since}&wait=${waitSeconds}`, sid, 'EVENTS', (waitSeconds + 10) * 1000);
  }
  /** Moderation: kick, ban, unban, mute, unmute, op, deop. */
  moderate(
    sid: string,
    roomId: string,
    action: 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'op' | 'deop',
    user: string,
    extra?: { reason?: string; minutes?: number },
  ): Promise<void> {
    return this.json('POST', `/rooms/${encodeURIComponent(roomId)}/${action}`, sid, { user, ...extra });
  }
  async setTopic(sid: string, roomId: string, topic: string): Promise<void> {
    await this.json('PUT', `/rooms/${encodeURIComponent(roomId)}/topic`, sid, { topic });
  }

  /** Roles are a sysop-session or admin surface; the proxy opens a short sysop session. */
  roles(sid: string): Promise<ChatRoleRow[]> {
    return this.json('GET', '/roles', sid);
  }
  createRole(sid: string, input: ChatRoleInput): Promise<ChatRoleRow> {
    return this.json('POST', '/roles', sid, input);
  }
  updateRole(sid: string, id: string, input: ChatRoleInput): Promise<ChatRoleRow> {
    return this.json('PUT', `/roles/${encodeURIComponent(id)}`, sid, input);
  }
  async deleteRole(sid: string, id: string): Promise<void> {
    await this.json('DELETE', `/roles/${encodeURIComponent(id)}`, sid);
  }
  roleAssignments(sid: string): Promise<ChatRoleAssignment[]> {
    return this.json('GET', '/roles/assignments', sid);
  }
  async setRoleAssignments(sid: string, handle: string, roleIds: string[]): Promise<void> {
    await this.json('PUT', `/roles/assignments/${encodeURIComponent(handle)}`, sid, { roleIds });
  }
}
