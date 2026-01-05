/**
 * Input box submit handler for LiveChat
 */
import type { Socket } from 'socket.io-client';
import type { CommandRegistry } from '../commands/types';
import { executeCommand } from '../core/command-exec';
import { replaceEmojis } from '../utils/emojis';
import { formatTime, escapeContent } from '../utils/format';
import { getUserColor } from '../core/formatter';

export function createSubmitHandler(
  socket: Socket,
  state: any,
  registry: CommandRegistry,
  cmdCtx: any,
  userId: number,
  username: string,
  onlineUsers: Map<string, any>,
  presenceService: any,
  socketEmitter: any,
  inputHistory: any,
  inputBox: any,
  screen: any,
  chatLog: any,
  currentSearchOverlayRef: any,
  drawingChannels: Set<string>,
  currentRoomLabel: string,
  hideCommandSuggestions: () => void,
  handleCommandActions: (r: any) => { handled: boolean },
  showLoading: (text: string) => void,
  showUserList: () => void,
  addChatMessage: (msg: string, applyMarkdown?: boolean) => void,
  addSystemMessage: (msg: string) => void,
  replyToThread: (socket: Socket, messageId: number, message: string) => void,
  pinMessage: (socket: Socket, roomId: string, messageId: number) => void,
  unpinMessage: (socket: Socket, roomId: string, messageId: number) => void,
  getPinnedMessages: (socket: Socket, roomId: string) => void,
  createSearchOverlay: any,
  searchMessages: any,
  cleanup: () => void,
  showSettingsOverlay: () => void,
  showHelpDialog: () => void,
  showDrawMenu: () => void,
  enterDrawingMode: (channel: string) => void,
  updateStatusBar: () => void,
  updateUserTable: () => void,
  showFileSharing: () => void,
  updateTypingPreview: () => void,
  clearChatLog: () => void
) {
  return async (value: string) => {
    try {
      // Hide command suggestions on submit
      hideCommandSuggestions();

      const msg = value.trim();
      if (!msg) {
        inputBox.clearValue();
        inputBox.focus();
        screen.render();
        return;
      }

      // Check if we're editing an existing message
      const isEditing = inputHistory.getEditingId() !== null;
      const editId = inputHistory.getEditingId();

      // Reset editing state
      inputHistory.reset();

      inputBox.clearValue();
      inputBox.focus();

      // Clear typing indicator (for others and self)
      socketEmitter.keystrokeSubmit(state.currentChannel, userId);

      // Clear own typing buffer and preview BEFORE adding message
      // This ensures appendLineToLog doesn't re-add our preview
      if (state.typingBuffers && state.typingBuffers.has(userId)) {
        state.typingBuffers.delete(userId);
        updateTypingPreview();  // Sync typingPreviewLines with typingBuffers
      }

      if (msg.startsWith('/')) {
        cmdCtx.currentChannel = state.currentChannel;
        const r = await executeCommand(msg, registry, cmdCtx);
        const cmdName = msg.slice(1).split(' ')[0].toLowerCase();

        // Handle command actions using extracted handler
        const actionResult = handleCommandActions(r);

        if (actionResult.handled) {
          return;
        }

        // Handle various commands
        if (r.action === 'join' && r.data?.channel) {
          if (state.currentChannel) socket.emit('room:leave');
          socket.emit('room:join', { roomName: r.data.channel });
          showLoading(`Joining #${r.data.channel}...`);
        }

        if (r.action === 'leave' || cmdName === 'leave' || cmdName === 'part') {
          if (state.currentChannel) {
            socket.emit('room:leave');
          } else {
            addSystemMessage('You are not in a room');
          }
        }

        if (cmdName === 'create' && r.data?.name) {
          socket.emit('room:create', { roomName: r.data.name, topic: r.data.topic || '', isPublic: true });
        }

        if (cmdName === 'who' || cmdName === 'users') {
          showUserList();
        }

        if ((cmdName === 'msg' || cmdName === 'dm' || cmdName === 'pm') && r.data?.target && r.data?.message) {
          const processedMsg = replaceEmojis(r.data.message);
          socket.emit('chat:dm', { to: r.data.target, message: processedMsg });
          addChatMessage(`{magenta-fg}[DM to ${r.data.target}]: ${processedMsg}{/magenta-fg}`, false);
        }

        if (cmdName === 'me' && r.message?.startsWith('ACTION:')) {
          const processedMsg = replaceEmojis(r.message);
          socket.emit('room:message', { message: processedMsg });
          const action = processedMsg.replace('ACTION: ', '');
          addChatMessage(`{magenta-fg}* ${action}{/magenta-fg}`, false);
        }

        if (cmdName === 'away' || cmdName === 'afk') {
          presenceService.setStatus(userId, 'away', r.data?.message);
          socket.emit('chat:presence', { status: 'away', custom: r.data?.message });
          const u = onlineUsers.get(String(userId));
          if (u) u.status = 'away';
          updateUserTable();
          updateStatusBar();
          addSystemMessage('You are now away');
        }

        if (cmdName === 'back' || cmdName === 'online') {
          presenceService.setStatus(userId, 'online');
          socket.emit('chat:presence', { status: 'online' });
          const u = onlineUsers.get(String(userId));
          if (u) u.status = 'online';
          updateUserTable();
          updateStatusBar();
          addSystemMessage('You are now online');
        }

        if (cmdName === 'clear' || cmdName === 'cls') {
          clearChatLog();
        }

        if (cmdName === 'settings') {
          showSettingsOverlay();
        }

        if (cmdName === 'help') {
          showHelpDialog();
        }

        // Drawing commands - create/join a drawing channel
        if (cmdName === 'draw' || cmdName === 'whiteboard' || cmdName === 'art') {
          const args = msg.split(' ').slice(1);
          if (args.length === 0) {
            // Show the drawing channel menu
            showDrawMenu();
          } else {
            // Create/join specific drawing channel
            let channelName = args[0].replace(/^art:/i, '');
            const fullName = `art:${channelName}`;
            drawingChannels.add(fullName);
            if (state.currentChannel) socket.emit('room:leave');
            socket.emit('room:join', { room: fullName });
            state.currentChannel = fullName;
            updateStatusBar();
            enterDrawingMode(fullName);
            addSystemMessage(`Joined drawing channel #${fullName}`);
          }
        }

        // File sharing commands
        if (cmdName === 'files' || cmdName === 'file' || cmdName === 'share') {
          showFileSharing();
        }

        if (r.error) addSystemMessage(`Error: ${r.error}`);
        if (r.message && !r.message.startsWith('ACTION:')) addChatMessage(r.message);
      } else {
        // Regular message or edit
        const time = formatTime(new Date());
        const color = getUserColor(username);

        if (isEditing && editId) {
          // Editing an existing message
          const processedMsg = replaceEmojis(msg);
          socket.emit('chat:edit', { messageId: editId, newText: processedMsg });
          addSystemMessage(`(edited) ${msg}`);
        } else {
          // New message - generate ID and add to history
          const messageId = `${userId}-${Date.now()}`;
          const processedMsg = replaceEmojis(msg);
          socket.emit('room:message', { message: processedMsg, messageId });

          // Add local echo immediately (server skips echoing own messages back)
          const time = formatTime(new Date());
          const color = getUserColor(username);
          addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${username}{/${color}-fg}> ${processedMsg}`, false);

          // Clear typing preview
          updateTypingPreview();

          // Add to history with ID
          inputHistory.add(messageId, msg);
        }
      }

      // Force complete clear including live preview content
      inputBox.clearValue();
      if ((inputBox as any).setContent) (inputBox as any).setContent('');
      if ((inputBox as any)._invalidateCoords) (inputBox as any)._invalidateCoords();
      
      inputBox.focus();
      screen.render();
    } catch (error) {
      addSystemMessage(`{red-fg}Error: ${error instanceof Error ? error.message : 'Unknown error'}{/red-fg}`);
      inputBox.clearValue();
      inputBox.focus();
      screen.render();
    }
  };
}
