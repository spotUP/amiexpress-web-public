/**
 * Command execution action handlers
 */
import type { Socket } from 'socket.io-client';
import type { CommandResult } from '../commands/types';

export function handleCommandActions(
  r: CommandResult,
  socket: Socket,
  state: any,
  onlineUsers: Map<string, any>,
  currentSearchOverlay: any,
  createSearchOverlay: any,
  searchMessages: any,
  addSystemMessage: any,
  replyToThread: any,
  pinMessage: any,
  unpinMessage: any,
  getPinnedMessages: any,
  screen: any,
  inputBox: any,
  cleanup: () => void
) {
  // Quit
  if (r.action === 'quit') {
    cleanup();
    return { handled: true };
  }

  // Thread
  if (r.action === 'thread' && r.data?.messageId && r.data?.message) {
    replyToThread(socket, r.data.messageId, r.data.message);
    return { handled: true };
  }

  // Pin
  if (r.action === 'pin' && r.data?.messageId) {
    pinMessage(socket, state.currentChannel, r.data.messageId);
    return { handled: true };
  }

  if (r.action === 'unpin' && r.data?.messageId) {
    unpinMessage(socket, state.currentChannel, r.data.messageId);
    return { handled: true };
  }

  if (r.action === 'showpinned') {
    getPinnedMessages(socket, state.currentChannel);
    return { handled: true };
  }

  // Search
  if (r.action === 'search') {
    if (currentSearchOverlay.current) currentSearchOverlay.current.destroy();
    currentSearchOverlay.current = createSearchOverlay(
      screen,
      (query: string, filters: any) => {
        if (query && query.length >= 2) {
          searchMessages(socket, query, {
            roomId: state.currentChannel,
            ...filters
          });
        } else {
          addSystemMessage('Search query must be at least 2 characters');
        }
      },
      () => {
        if (currentSearchOverlay.current) {
          currentSearchOverlay.current.destroy();
          currentSearchOverlay.current = null;
        }
        inputBox.focus();
      }
    );
    if (r.data?.query) {
      currentSearchOverlay.current.searchInput.setValue(r.data.query);
      searchMessages(socket, r.data.query, { roomId: state.currentChannel });
    }
    return { handled: true };
  }

  // Moderation
  if (r.action === 'kick' && r.data?.target) {
    const targetUser = Array.from(onlineUsers.values()).find(u => u.username === r.data.target);
    if (targetUser) {
      socket.emit('chat:kick', {
        roomId: state.currentChannel,
        targetUserId: targetUser.id,
        reason: r.data.reason
      });
    } else {
      addSystemMessage(`User ${r.data.target} not found`);
    }
    return { handled: true };
  }

  if (r.action === 'ban' && r.data?.target) {
    const targetUser = Array.from(onlineUsers.values()).find(u => u.username === r.data.target);
    if (targetUser) {
      socket.emit('chat:ban', {
        roomId: state.currentChannel,
        targetUserId: targetUser.id,
        reason: r.data.reason,
        duration: r.data.duration
      });
    } else {
      addSystemMessage(`User ${r.data.target} not found`);
    }
    return { handled: true };
  }

  if (r.action === 'unban' && r.data?.target) {
    const targetUser = Array.from(onlineUsers.values()).find(u => u.username === r.data.target);
    if (targetUser) {
      socket.emit('chat:unban', {
        roomId: state.currentChannel,
        targetUserId: targetUser.id
      });
    } else {
      addSystemMessage(`User ${r.data.target} not found`);
    }
    return { handled: true };
  }

  if (r.action === 'mute' && r.data?.target) {
    const targetUser = Array.from(onlineUsers.values()).find(u => u.username === r.data.target);
    if (targetUser) {
      socket.emit('chat:mute', {
        roomId: state.currentChannel,
        targetUserId: targetUser.id,
        duration: r.data.duration
      });
    } else {
      addSystemMessage(`User ${r.data.target} not found`);
    }
    return { handled: true };
  }

  if (r.action === 'unmute' && r.data?.target) {
    const targetUser = Array.from(onlineUsers.values()).find(u => u.username === r.data.target);
    if (targetUser) {
      socket.emit('chat:unmute', {
        roomId: state.currentChannel,
        targetUserId: targetUser.id
      });
    } else {
      addSystemMessage(`User ${r.data.target} not found`);
    }
    return { handled: true };
  }

  return { handled: false };
}
