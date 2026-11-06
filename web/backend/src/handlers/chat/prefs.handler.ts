/**
 * Server-side LiveChat prefs, same shape as /ignore: stored per user in the
 * DB (chat_prefs) so they survive calls and restarts.
 *
 * Socket events (handled in server/chat-socket-handlers.ts and routed from the
 * door in handlers/door.handler.ts):
 *   chat:prefs      (request)  replies chat:prefs { prefs }
 *   chat:prefs-set  { prefs }  validates, saves, replies chat:prefs { prefs }
 */
import { db } from '../../database';
import type { BBSSession } from '../../index';
import type { IgnoreEmitter } from './ignore.handler';

export const MAX_PREFS_BYTES = 8 * 1024;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function handleChatPrefs(
  emitter: IgnoreEmitter,
  session: BBSSession,
  action: 'get' | 'set',
  data?: { prefs?: unknown },
): void {
  const id = session.user?.id;
  if (id === undefined || id === null) return;
  const repo = db.chatPrefs();
  const owner = String(id);
  if (action === 'set') {
    const prefs = data?.prefs;
    if (!isPlainObject(prefs) || JSON.stringify(prefs).length > MAX_PREFS_BYTES) return;
    repo.set(owner, prefs);
  }
  emitter.emit('chat:prefs', { prefs: repo.get(owner) ?? {} });
}
