/**
 * Server-side /ignore. The list lives in the DB (chat_ignores) so it survives
 * restarts and applies on every transport: room broadcast and DM delivery ask
 * `recipientIgnores` before they emit, so the ignored user's line never
 * leaves the server for the ignorer.
 *
 * Socket events (handled in server/chat-socket-handlers.ts):
 *   chat:ignore       { user }   add, replies chat:ignore-list
 *   chat:unignore     { user }   remove, replies chat:ignore-list
 *   chat:ignore-list  (request)  replies chat:ignore-list { users: string[] }
 */
import { db } from '../../database';
import type { BBSSession } from '../../index';

export interface IgnoreEmitter {
  emit(event: string, payload: unknown): unknown;
}

/** True when `recipient` has ignored `senderUsername`. */
export function recipientIgnores(recipient: BBSSession | undefined, senderUsername: string): boolean {
  const id = recipient?.user?.id;
  if (id === undefined || id === null) return false;
  return recipientIgnoresId(String(id), senderUsername);
}

export function recipientIgnoresId(recipientUserId: string, senderUsername: string): boolean {
  return db.chatIgnores().isIgnoring(recipientUserId, senderUsername);
}

export function handleChatIgnore(
  emitter: IgnoreEmitter,
  session: BBSSession,
  action: 'ignore' | 'unignore' | 'list',
  data?: { user?: string },
): void {
  const id = session.user?.id;
  if (id === undefined || id === null) return;
  const repo = db.chatIgnores();
  const owner = String(id);
  const target = typeof data?.user === 'string' ? data.user : '';
  // Ignoring yourself would silence your own echo; refuse it.
  const self = String(session.user?.username ?? '').toLowerCase();
  if (action === 'ignore' && target.trim().toLowerCase() !== self) repo.add(owner, target);
  else if (action === 'unignore') repo.remove(owner, target);
  emitter.emit('chat:ignore-list', { users: repo.list(owner) });
}
