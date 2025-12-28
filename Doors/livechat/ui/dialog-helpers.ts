/**
 * Dialog helper functions for LiveChat
 */
import type { Socket } from 'socket.io-client';

export function createDialogHelpers(
  showHelp: () => void,
  showModal: (modal: any) => void,
  showPromptDialog: (prompt: string, defaultValue: string, callback: (err: any, value?: string) => void) => void,
  showMessageDialog: (message: string, callback?: () => void) => void,
  settingsOverlay: any,
  inputBox: any,
  screen: any,
  socket: Socket,
  state: any,
  onlineUsers: Map<string, any>,
  addSystemMessage: (msg: string) => void,
  addChatMessage: (msg: string) => void,
  replaceEmojis: (text: string) => string,
  PRESENCE_INDICATORS: any
) {
  function showHelpDialog() {
    showHelp();
  }

  function showSettingsOverlay() {
    showModal(settingsOverlay);
  }

  function showNewMessagePrompt() {
    inputBox.focus();
    screen.render();
  }

  function showRoomMenu() {
    showPromptDialog('Enter room name to join:', '', (err, value) => {
      if (!err && value) {
        const roomName = value.replace(/^#/, '');
        if (state.currentChannel === roomName) {
          addSystemMessage(`Already in #${roomName}`);
          inputBox.focus();
          screen.render();
          return;
        }
        if (state.currentChannel) socket.emit('room:leave');
        socket.emit('room:join', { roomName });
        addSystemMessage(`Joining #${roomName}...`);
      }
      inputBox.focus();
      screen.render();
    });
  }

  function showUserList() {
    const users = Array.from(onlineUsers.values())
      .map(u => `${PRESENCE_INDICATORS[u.status]} ${u.username}`)
      .join('\n');
    showMessageDialog('{bold}Users Online{/bold}\n\n' + users, () => { inputBox.focus(); });
  }

  function showDMPrompt(targetUser: string) {
    showPromptDialog(`Message to @${targetUser}:`, '', (err, value) => {
      if (!err && value) {
        const processedMsg = replaceEmojis(value);
        socket.emit('chat:dm', { to: targetUser, message: processedMsg });
        addChatMessage(`{magenta-fg}[DM to ${targetUser}]: ${processedMsg}{/magenta-fg}`);
      }
      inputBox.focus();
      screen.render();
    });
  }

  return {
    showHelpDialog,
    showSettingsOverlay,
    showNewMessagePrompt,
    showRoomMenu,
    showUserList,
    showDMPrompt
  };
}
