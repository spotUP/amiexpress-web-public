"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDialogHelpers = createDialogHelpers;
function createDialogHelpers(showHelp, showModal, showPromptDialog, showMessageDialog, settingsOverlay, inputBox, screen, socket, state, onlineUsers, addSystemMessage, addChatMessage, replaceEmojis, PRESENCE_INDICATORS) {
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
                if (state.currentChannel)
                    socket.emit('room:leave');
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
    function showDMPrompt(targetUser) {
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
