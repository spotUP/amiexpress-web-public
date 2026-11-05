/**
 * DM sidebar / context socket listeners.
 *
 * Extracted from server.ts to keep that file under the 2000-line limit
 * (see CLAUDE.md rule 18). Wires the two server-pushed events:
 *   - chat:dm-threads   updates the sidebar DM thread list
 *   - chat:dm-history   renders historical DM messages for the active thread
 */
import { formatDmLine } from './dm-render';

export interface DmSidebarHandlerCtx {
  socket: any;
  state: any;
  userId: number;
  screen: any;
  updateChannelList: () => void;
  addChatMessage: (line: string, applyMarkdown?: boolean) => void;
}

export function setupDmSidebarHandlers(ctx: DmSidebarHandlerCtx): void {
  const { socket, state, userId, screen, updateChannelList, addChatMessage } = ctx;

  // Backend pushes the latest DM thread list whenever a DM is sent
  // (or when the door asks for it on bootstrap). Refresh the sidebar
  // so newly-created threads appear and existing ones re-sort.
  socket.on('chat:dm-threads', (data: any) => {
    if (!data || !Array.isArray(data.threads)) return;
    state.dmThreads = data.threads;
    if (typeof updateChannelList === 'function') updateChannelList();
  });

  // Backend response to chat:dm-history. Render historical messages into
  // the chat log for the active DM thread. Stale loads (user already
  // switched away) are dropped.
  socket.on('chat:dm-history', (data: any) => {
    if (!data || !Array.isArray(data.messages)) return;
    if (state.currentDmThread !== data.threadId) return;
    // Locate the thread in the cached list so we can render group/1:1
    // and tag the right direction per row.
    const thread = (state.dmThreads || []).find((t: any) => t.threadId === data.threadId);
    const isGroup = !!(thread && thread.isGroup);
    for (const m of data.messages) {
      const senderId = String(m.sender_id ?? m.senderId ?? '');
      const senderName = String(m.sender_username ?? m.senderUsername ?? m.from ?? '?');
      const direction = senderId === String(userId) ? 'sent' : 'received';
      const payload: any = {
        direction,
        message: m.message ?? m.body ?? '',
        isGroup,
        from: senderName,
      };
      if (isGroup && thread) {
        payload.participants = thread.participants;
      } else if (!isGroup && thread) {
        payload.to = direction === 'sent' ? (thread.participants[0] || '?') : senderName;
      }
      addChatMessage(formatDmLine(payload), false);
    }
    if (screen && typeof screen.render === 'function') screen.render();
  });
}
