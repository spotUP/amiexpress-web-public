/**
 * DM thread list handler
 *
 * Provides a display-ready, sidebar-friendly view of every DM thread
 * the user is a participant of. Used to render the "DIRECT MESSAGES"
 * section in the LiveChat sidebar (mirrors how text channels render).
 *
 * Modern enhancement beyond original AmiExpress BBS (no express.e
 * counterpart).
 */
import type { Server as IOServer } from 'socket.io';
import { db } from '../../database';

export interface DmThreadView {
  threadId: string;
  isGroup: boolean;
  /**
   * Friendly label for the sidebar entry.
   *  - 1:1: the other user's username.
   *  - group: the comma-joined participant usernames excluding self.
   */
  displayName: string;
  /** Participant usernames, excluding the requesting user. */
  participants: string[];
  /** Last activity time (unix epoch seconds). Used for sort order. */
  lastActivityAt: number;
  /** Optional preview of the most recent message body. */
  lastMessage?: string;
}

/**
 * Build the per-user DM thread list.
 *
 * Pure DB read — no socket emit. Caller is responsible for delivery.
 */
export async function getDmThreadList(userId: string): Promise<DmThreadView[]> {
  const rows = await db.listUserDmThreads(userId);
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const result: DmThreadView[] = [];
  for (const row of rows) {
    const threadId: string = row.thread_id;
    const isGroup: boolean = !!row.is_group;
    const participants = await db.getDmParticipants(threadId);
    const others = participants
      .filter((p: any) => String(p.user_id) !== String(userId))
      .map((p: any) => String(p.username));

    let displayName: string;
    if (!isGroup) {
      displayName = others[0] || '(unknown)';
    } else {
      displayName = others.length > 0 ? others.join(', ') : '(empty group)';
    }

    // Most-recent message preview (small N).
    let lastMessage: string | undefined;
    try {
      const history = await db.getDmHistory(threadId, 50);
      if (Array.isArray(history) && history.length > 0) {
        const newest = history[history.length - 1];
        const text = newest && (newest.message ?? newest.body);
        if (typeof text === 'string') lastMessage = text;
      }
    } catch {
      // Defensive: a corrupt thread shouldn't take the sidebar down.
    }

    result.push({
      threadId,
      isGroup,
      displayName,
      participants: others,
      lastActivityAt: Number(row.last_activity_at) || 0,
      lastMessage,
    });
  }
  return result;
}

/**
 * Push the latest DM thread list to every participant's `user:<id>` room.
 * Sockets join their own user-room on auth so this fans out to every
 * tab/window that the user is connected from.
 */
export async function broadcastDmThreadsToParticipants(
  io: IOServer | undefined | null,
  userIds: ReadonlyArray<string>,
): Promise<void> {
  if (!io || !userIds || userIds.length === 0) return;
  const seen = new Set<string>();
  for (const raw of userIds) {
    const uid = String(raw);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    try {
      const threads = await getDmThreadList(uid);
      io.to('user:' + uid).emit('chat:dm-threads', { threads });
    } catch (err) {
      console.error('[dm-thread-list] broadcast error for user', uid, err);
    }
  }
}
