/**
 * Command execution action handlers
 */
import type { Socket } from 'socket.io-client';
import type { CommandResult } from '../commands/types';
import { editMessage, deleteMessage } from './edit-handlers';
import { reactToMessage, unreactToMessage, listMessageReactions } from './reaction-handlers';

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
  cleanup: () => void,
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void,
  lastOwnMessageId?: () => string | null
) {
  // Quit - show confirmation dialog
  if (r.action === 'quit') {
    if (showConfirm) {
      showConfirm('Are you sure you want to quit LiveChat?', (confirmed) => {
        if (confirmed) {
          cleanup();
        } else {
          inputBox.focus();
          screen.render();
        }
      });
    } else {
      // Fallback if no confirm function provided
      cleanup();
    }
    return { handled: true };
  }

  // Thread
  if (r.action === 'thread' && r.data?.messageId && r.data?.message) {
    replyToThread(socket, r.data.messageId, r.data.message);
    return { handled: true };
  }

  // Edit / delete: an id, or else your own last message. Only a stored id
  // (all digits) can be named; a line still waiting for its ack cannot.
  if (r.action === 'edit' || r.action === 'deletemsg') {
    const id = r.data?.messageId ?? lastOwnMessageId?.() ?? null;
    if (id == null || !/^\d+$/.test(String(id))) {
      addSystemMessage('No message to ' + (r.action === 'edit' ? 'edit' : 'delete') + ': name one with its id, or send a line first.');
    } else if (r.action === 'edit') {
      editMessage(socket, state.currentChannel, String(id), r.data.text);
    } else {
      deleteMessage(socket, state.currentChannel, String(id));
    }
    return { handled: true };
  }

  // Reactions: stored by the backend, counts come back as chat:reaction
  if ((r.action === 'react' || r.action === 'unreact') && r.data?.messageId && r.data?.emoji) {
    const send = r.action === 'react' ? reactToMessage : unreactToMessage;
    send(socket, state.currentChannel, String(r.data.messageId), r.data.emoji);
    return { handled: true };
  }

  // Custom emoji: the backend checks the sysop level, stores, and broadcasts the list
  if (r.action === 'customemoji' && r.data?.event) {
    socket.emit(r.data.event, r.data.payload);
    return { handled: true };
  }

  if (r.action === 'reactions' && r.data?.messageId) {
    listMessageReactions(socket, state.currentChannel, String(r.data.messageId));
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
