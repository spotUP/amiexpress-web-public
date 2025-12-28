/**
 * Input box submit handler for LiveChat
 */
import type { Socket } from 'socket.io-client';
import type { CommandRegistry } from '../commands/types';
import { executeCommand } from '../core/command-exec';
import { replaceEmojis } from '../utils/emojis';
import { formatTime } from '../utils/format';
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
  addChatMessage: (msg: string) => void,
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
  updateTypingPreview: () => void
) {
  return async (value: string) => {
    console.log('[SUBMIT HANDLER] Called with value:', JSON.stringify(value));
    try {
      // Hide command suggestions on submit
      hideCommandSuggestions();

      const msg = value.trim();
      console.log('[SUBMIT HANDLER] Trimmed message:', JSON.stringify(msg));
      if (!msg) {
        console.log('[SUBMIT HANDLER] Empty message, returning');
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

      // Clear own typing buffer and update display
      if (state.typingBuffers && state.typingBuffers.has(userId)) {
        state.typingBuffers.delete(userId);
        updateTypingPreview(); // Remove typing preview from screen
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
          socket.emit('room:leave');
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
          addChatMessage(`{magenta-fg}[DM to ${r.data.target}]: ${processedMsg}{/magenta-fg}`);
        }

        if (cmdName === 'me' && r.message?.startsWith('ACTION:')) {
          const processedMsg = replaceEmojis(r.message);
          socket.emit('room:message', { message: processedMsg });
          const action = processedMsg.replace('ACTION: ', '');
          addChatMessage(`{magenta-fg}* ${action}{/magenta-fg}`);
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
          chatLog.setContent('');
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
          console.log('[SUBMIT HANDLER] Emitting room:message:', { message: processedMsg, messageId, channel: state.currentChannel });
          socket.emit('room:message', { message: processedMsg, messageId });
          console.log('[SUBMIT HANDLER] Adding to chat log');
          addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${username}{/${color}-fg}> ${processedMsg}`);
          console.log('[SUBMIT HANDLER] Message displayed in chat log');

          // Add to history with ID
          inputHistory.add(messageId, msg);
        }
      }

      // Force complete clear by hiding and showing the input box
      inputBox.clearValue();
      inputBox.hide();
      screen.render();
      inputBox.show();
      inputBox.focus();
      screen.render();
    } catch (error) {
      console.error('[LiveChat] Error in submit handler:', error);
      addSystemMessage(`{red-fg}Error: ${error instanceof Error ? error.message : 'Unknown error'}{/red-fg}`);
      inputBox.clearValue();
      inputBox.focus();
      screen.render();
    }
  };
}
