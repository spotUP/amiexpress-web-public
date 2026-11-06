/**
 * Input box submit handler for LiveChat
 */
import type { Socket } from 'socket.io-client';
import { editMessage } from './edit-handlers';
import type { CommandRegistry } from '../commands/types';
import { executeCommand } from '../core/command-exec';
import { looksLikeCommand } from './command';
import { formatTime, escapeContent } from '../utils/format';
import { parseContent } from '../utils/markdown';
import { getUserColor } from '../core/formatter';
import { T } from '../door-theme';
import type { MessagePicker } from '../features/message-picker';
import { namesAtLevel, muteLevel, muteMessage, toggleMute } from '../core/mute-list';
import { findOnlineUser, formatWhois } from './whois-render';
import { channelsToShow } from '../core/state';
import { settings } from '../settings';
import { saveSettings, prefsAsCheckboxes } from '../overlays/settings-save';
import { prefsSender } from '../core/prefs-sync';

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
  replyToThread: (socket: Socket, messageId: string, message: string) => void,
  pinMessage: (socket: Socket, roomId: string, messageId: string) => void,
  unpinMessage: (socket: Socket, roomId: string, messageId: string) => void,
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
  messagePicker?: MessagePicker,
  tryJoinVoiceChannel?: (channelName: string) => boolean,
  sendRoomLine?: (text: string, replyTo?: string) => void
) {
  return async (value: string) => {
    try {
      // Hide command suggestions on submit
      hideCommandSuggestions();

      // Enter while a message is being picked confirms the pick.
      if (messagePicker?.state.active) {
        messagePicker.confirm();
        return;
      }

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
        // /love, /pin ... with no id: pick the message with the arrow keys.
        if (messagePicker?.startFromCommand(msg)) return;
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
          const processedMsg = r.data.message; // the :code: travels; each client renders it
          if (r.data.targets.length === 1) {
            socket.emit('chat:dm', { to: r.data.targets[0], message: processedMsg });
          } else {
            socket.emit('chat:group-dm', { participants: r.data.targets, message: processedMsg });
          }
          // local echo removed: backend echoes sent DM with direction: 'sent'
        }

        // /whois <name> (and its /info alias) - the command returns
        // { type: 'whois', username } and this is the only consumer. Keyed on
        // the data type, not cmdName, so the alias works too.
        if (r.data?.type === 'whois' && r.data?.username) {
          addSystemMessage(formatWhois(findOnlineUser(onlineUsers, r.data.username), r.data.username));
        }

        if (cmdName === 'me' && r.message?.startsWith('ACTION:')) {
          const processedMsg = r.message; // the :code: travels; each client renders it
          socket.emit('room:message', { message: processedMsg });
          const action = processedMsg.replace('ACTION: ', '');
          addChatMessage(`{${T.accentAlt}-fg}* ${action}{/${T.accentAlt}-fg}`, false);
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

        // /status, /sounds, /compact, /timestamps: presence goes through the
        // presence service and chat:presence (as /away does); the three
        // preferences go through saveSettings, the settings overlay's own path.
        if (r.action === 'pref' && r.data?.kind === 'status') {
          const status = r.data.status as string;
          presenceService.setStatus(userId, status, r.data.message || undefined);
          socket.emit('chat:presence', { status, custom: r.data.message || undefined });
          const u = onlineUsers.get(String(userId));
          if (u) u.status = status;
          updateUserTable();
          updateStatusBar();
          addSystemMessage(`Status: ${status}${r.data.message ? ' - ' + r.data.message : ''}`);
        } else if (r.action === 'pref') {
          const p = state.prefs;
          let note = '';
          if (r.data.kind === 'sounds') {
            saveSettings(state, prefsAsCheckboxes(state, { muteSounds: !r.data.value }), updateStatusBar, prefsSender(socket));
            note = r.data.value ? 'Sounds enabled' : 'Sounds disabled';
          } else if (r.data.kind === 'compact') {
            saveSettings(state, prefsAsCheckboxes(state, { compact: !p.compactMode }), updateStatusBar, prefsSender(socket));
            note = p.compactMode ? 'Compact mode on' : 'Compact mode off';
          } else if (r.data.kind === 'timestamps') {
            saveSettings(state, prefsAsCheckboxes(state, { timestamps: !p.showTimestamps }), updateStatusBar, prefsSender(socket));
            note = p.showTimestamps ? 'Timestamps on' : 'Timestamps off';
          }
          if (note) addSystemMessage(note);
        }

        if (cmdName === 'motd') {
          if (r.data?.op === 'set') {
            socket.emit('room:motd', { motd: r.data.motd });
          } else if (r.data?.op === 'show') {
            const cached = state.currentRoomMotd;
            if (cached) addSystemMessage(`{${T.accentAlt}-fg}[MOTD] ${cached}{/${T.accentAlt}-fg}`);
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

        if (cmdName === 'help') {
          showHelpDialog();
        }

        // Door-UI commands (commands/ui.ts) name their effect in data.type,
        // so aliases (/art, /share ...) take the same path as the command.
        switch (r.data?.type) {
          case 'settings':
            showSettingsOverlay();
            break;
          case 'draw':
            if (!r.data.channel) {
              showDrawMenu();
            } else {
              // Create/join a specific drawing channel
              const fullName = `art:${String(r.data.channel).replace(/^art:/i, '')}`;
              drawingChannels.add(fullName);
              if (state.currentChannel) socket.emit('room:leave');
              socket.emit('room:join', { room: fullName });
              state.currentChannel = fullName;
              updateStatusBar();
              enterDrawingMode(fullName);
              addSystemMessage(`Joined drawing channel #${fullName}`);
            }
            break;
          case 'files':
            showFileSharing();
            break;
          case 'rooms': {
            const rooms = channelsToShow(state.channels, settings().defaultChannel, state.prefs.pinnedChannels);
            addSystemMessage(`Rooms: ${rooms.map(c => `#${c.name}${c.memberCount ? ` (${c.memberCount})` : ''}`).join(', ')}`);
            break;
          }
          case 'ignore': {
            if (!r.data.user) {
              const names = namesAtLevel(state.muteList, 'ignore');
              addSystemMessage(names.length === 0 ? 'You are not ignoring anyone.' : `Ignoring: ${names.join(', ')}`);
            } else if (muteLevel(state.muteList, r.data.user) === 'ignore') {
              addSystemMessage(`Already ignoring ${r.data.user}.`);
            } else {
              // Sets the level (replacing a mute/block) and never toggles it off.
              state.muteList.delete(r.data.user.toLowerCase());
              addSystemMessage(muteMessage(r.data.user, toggleMute(state.muteList, r.data.user, 'ignore')));
              socket.emit('chat:ignore', { user: r.data.user });
            }
            break;
          }
          case 'unignore':
            if (muteLevel(state.muteList, r.data.user) === 'ignore') {
              toggleMute(state.muteList, r.data.user, 'ignore');
              socket.emit('chat:unignore', { user: r.data.user });
              addSystemMessage(muteMessage(r.data.user, null));
            } else {
              addSystemMessage(`You are not ignoring ${r.data.user}.`);
            }
            break;
        }

        if (r.error) addSystemMessage(`Error: ${r.error}`);
        if (r.message && !r.message.startsWith('ACTION:')) addChatMessage(r.message);
      } else {
        // Regular message or edit
        const time = formatTime(new Date());
        const color = getUserColor(username);

        if (isEditing && editId) {
          // Editing an existing message
          const processedMsg = msg; // the :code: travels; each client renders it
          editMessage(socket, state.currentChannel, editId, processedMsg);
        } else if (state.currentDmThread) {
          // DM context: route via chat:dm (1:1) or chat:group-dm (group).
          // Backend echoes the canonical payload back via 'chat:dm' so
          // we deliberately do NOT add a local chat-log line here.
          const processedMsg = msg; // the :code: travels; each client renders it
          const thread = (state.dmThreads || []).find((t: any) => t.threadId === state.currentDmThread);
          if (!thread) {
            addSystemMessage(`{${T.alert}-fg}DM thread not found in sidebar; refreshing...{/${T.alert}-fg}`);
            socket.emit('chat:dm-threads:list');
          } else if (thread.isGroup) {
            socket.emit('chat:group-dm', { participants: thread.participants, message: processedMsg });
          } else {
            const target = thread.participants[0];
            if (!target) {
              addSystemMessage(`{${T.alert}-fg}DM thread has no recipient.{/${T.alert}-fg}`);
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
          // New message: the same path /reply uses.
          sendRoomLine?.(msg);
        }
      }

      // Force complete clear including live preview content
      inputBox.clearValue();
      if ((inputBox as any).setContent) (inputBox as any).setContent('');
      if ((inputBox as any)._invalidateCoords) (inputBox as any)._invalidateCoords();
      
      inputBox.focus();
      screen.render();
    } catch (error) {
      addSystemMessage(`{${T.alert}-fg}Error: ${error instanceof Error ? error.message : 'Unknown error'}{/${T.alert}-fg}`);
      inputBox.clearValue();
      inputBox.focus();
      screen.render();
    }
  };
}
