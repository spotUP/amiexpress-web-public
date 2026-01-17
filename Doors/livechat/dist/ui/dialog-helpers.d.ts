/**
 * Dialog helper functions for LiveChat
 */
import type { Socket } from 'socket.io-client';
export declare function createDialogHelpers(showHelp: () => void, showModal: (modal: any) => void, showPromptDialog: (prompt: string, defaultValue: string, callback: (err: any, value?: string) => void) => void, showMessageDialog: (message: string, callback?: () => void) => void, settingsOverlay: any, inputBox: any, screen: any, socket: Socket, state: any, onlineUsers: Map<string, any>, addSystemMessage: (msg: string) => void, addChatMessage: (msg: string) => void, replaceEmojis: (text: string) => string, PRESENCE_INDICATORS: any): {
    showHelpDialog: () => void;
    showSettingsOverlay: () => void;
    showNewMessagePrompt: () => void;
    showRoomMenu: () => void;
    showUserList: () => void;
    showDMPrompt: (targetUser: string) => void;
};
