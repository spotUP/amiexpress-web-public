/**
 * Saying something in the board's LiveChat.
 *
 * One socket event with a fixed shape, which the backend reads as a system
 * announcement. Kept out of the door for the same reason the activity hints
 * are: what the door SAYS is worth testing without a terminal, and index.ts
 * is at the repo's line ceiling.
 *
 * This reaches people watching the board. It does NOT reach Discord or Slack -
 * that is what ctx.announce is for (sdk/core/announce.ts), and a door that
 * wants both says both.
 */

export interface LiveChatSession {
  socket?: { emit?: (event: string, payload: unknown) => void };
  user?: { id?: string | number; username?: string };
  bbsSession?: { nodeId?: number };
}

export function emitLiveChatAnnouncement(session: LiveChatSession, message: string): void {
  const socket = session.socket;
  if (typeof socket?.emit !== 'function') return;

  socket.emit('bbs:event', {
    type: 'system_announcement',
    details: { message },
    visibility: 'all',
    timestamp: new Date(),
    userId: Number(session.user?.id) || undefined,
    username: session.user?.username,
    nodeId: session.bbsSession?.nodeId || 1,
  });
}
