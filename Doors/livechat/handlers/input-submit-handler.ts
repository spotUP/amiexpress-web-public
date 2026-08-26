/**
 * Input box submit handler for LiveChat
 */
import type { Socket } from 'socket.io-client';
import type { CommandRegistry } from '../commands/types';
import { executeCommand } from '../core/command-exec';
import { looksLikeCommand } from './command';
import { replaceEmojis } from '../utils/emojis';
import { formatTime, escapeContent } from '../utils/format';
import { parseContent } from '../utils/markdown';
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
  addChatMessage: (msg: string, applyMarkdown?: boolean, messageId?: string) => void,
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
  clearChatLog: () => void,
  tryJoinVoiceChannel?: (channelName: string) => boolean
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

      if (looksLikeCommand(msg)) {
        cmdCtx.currentChannel = state.currentChannel;
        const r = await executeCommand(msg, registry, cmdCtx);
        const cmdName = msg.slice(1).split(' ')[0].toLowerCase();

        // Handle command actions using extracted handler
        const actionResult = handleCommandActions(r);

        if (actionResult.handled) {
          return;
        }

        // Switch microphone, when /mic named one.
        //
        // The browser owns the device; the door can only ask. It travels as
        // an event rather than a return value because reopening the input
        // means stopping and restarting capture.
        if (r.data?.selectMicDeviceId) {
          socket.emit('audio:select-device', { deviceId: r.data.selectMicDeviceId });
        }

        // Handle various commands
        if (r.action === 'join' && r.data?.channel) {
          // Check if this is a voice channel (via callback to server.ts)
          if (tryJoinVoiceChannel && tryJoinVoiceChannel(r.data.channel)) {
            // Voice channel join handled
          } else {
            if (state.currentChannel) socket.emit('room:leave');
            socket.emit('room:join', { roomName: r.data.channel });
            showLoading(`Joining #${r.data.channel}...`);
          }
        }

        if (r.action === 'leave' || cmdName === 'leave' || cmdName === 'part') {
          if (state.currentChannel) {
            socket.emit('room:leave');
          } else {
            addSystemMessage('You are not in a room');
          }
        }

        if (cmdName === 'create' && r.data?.name) {
          socket.emit('room:create', {
            roomName: r.data.name,
            topic: r.data.topic || '',
            isPublic: !r.data.isPrivate,
            isInviteOnly: r.data.isInviteOnly || r.data.isPrivate,
            motd: r.data.motd || null,
          });
        }

        if (cmdName === 'who' || cmdName === 'users') {
          showUserList();
        }

        if ((cmdName === 'msg' || cmdName === 'dm' || cmdName === 'pm') && r.data?.targets && r.data?.message) {
          const processedMsg = replaceEmojis(r.data.message);
          if (r.data.targets.length === 1) {
            socket.emit('chat:dm', { to: r.data.targets[0], message: processedMsg });
          } else {
            socket.emit('chat:group-dm', { participants: r.data.targets, message: processedMsg });
          }
          // local echo removed: backend echoes sent DM with direction: 'sent'
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

        if (cmdName === 'motd') {
          if (r.data?.op === 'set') {
            socket.emit('room:motd', { motd: r.data.motd });
          } else if (r.data?.op === 'show') {
            const cached = state.currentRoomMotd;
            if (cached) addSystemMessage(`{yellow-fg}[MOTD] ${cached}{/yellow-fg}`);
            else addSystemMessage('No MOTD set. Use /motd <text> to set, /motd --clear to clear.');
          } else {
            addSystemMessage('Use /motd <text> to set, /motd --clear to clear.');
          }
        }

        if (cmdName === 'invite' && r.data?.target) {
          socket.emit('room:invite', { targetUsername: r.data.target, roomName: r.data.room });
        }
        if (cmdName === 'uninvite' && r.data?.target) {
          socket.emit('room:revoke-invite', { targetUsername: r.data.target, roomName: r.data.room });
        }
        if (cmdName === 'mode' && r.data?.modeString) {
          socket.emit('room:mode', { modeString: r.data.modeString, params: r.data.params || [] });
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
        } else if (state.currentDmThread) {
          // DM context: route via chat:dm (1:1) or chat:group-dm (group).
          // Backend echoes the canonical payload back via 'chat:dm' so
          // we deliberately do NOT add a local chat-log line here.
          const processedMsg = replaceEmojis(msg);
          const thread = (state.dmThreads || []).find((t: any) => t.threadId === state.currentDmThread);
          if (!thread) {
            addSystemMessage('{red-fg}DM thread not found in sidebar; refreshing...{/red-fg}');
            socket.emit('chat:dm-threads:list');
          } else if (thread.isGroup) {
            socket.emit('chat:group-dm', { participants: thread.participants, message: processedMsg });
          } else {
            const target = thread.participants[0];
            if (!target) {
              addSystemMessage('{red-fg}DM thread has no recipient.{/red-fg}');
            } else {
              socket.emit('chat:dm', { to: target, message: processedMsg });
            }
          }
          updateTypingPreview();
          // Belt-and-suspenders: explicitly clear the input box after a DM
          // send so typed text never lingers (mirrors the room-message branch
          // and the post-block unified clear below).
          inputBox.clearValue();
          if ((inputBox as any).setContent) (inputBox as any).setContent('');
          inputBox.focus();
          screen.render();
        } else {
          // New message - generate ID and add to history
          const messageId = `${userId}-${Date.now()}`;
          const processedMsg = replaceEmojis(msg);
          socket.emit('room:message', { message: processedMsg, messageId });

          // Add local echo immediately (server skips echoing own messages back)
          //
          // The CONTENT is parsed here, exactly as it is for a message from
          // anyone else - see core/formatter.formatMessage. Without this the
          // sender was the one person who never saw their own formatting:
          // "**this is bold** just prints **this is bold**", while everyone
          // else in the room saw it bold. The line is then passed with
          // applyMarkdown false because the tags around it are ours, not the
          // user's, and must not be parsed a second time.
          const time = formatTime(new Date());
          const color = getUserColor(username);
          const rendered = parseContent(processedMsg);
          addChatMessage(`{gray-fg}[${time}]{/gray-fg} <{${color}-fg}${username}{/${color}-fg}> ${rendered}`, false, messageId);

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
