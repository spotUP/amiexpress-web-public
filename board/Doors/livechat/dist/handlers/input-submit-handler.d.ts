/**
 * Input box submit handler for LiveChat
 */
import type { Socket } from 'socket.io-client';
import type { CommandRegistry } from '../commands/types';
import type { MessagePicker } from '../features/message-picker';
export declare function createSubmitHandler(socket: Socket, state: any, registry: CommandRegistry, cmdCtx: any, userId: number, username: string, onlineUsers: Map<string, any>, presenceService: any, socketEmitter: any, inputHistory: any, inputBox: any, screen: any, chatLog: any, currentSearchOverlayRef: any, drawingChannels: Set<string>, currentRoomLabel: string, hideCommandSuggestions: () => void, handleCommandActions: (r: any) => {
    handled: boolean;
}, showLoading: (text: string) => void, showUserList: () => void, addChatMessage: (msg: string, applyMarkdown?: boolean, messageId?: string) => void, addSystemMessage: (msg: string) => void, replyToThread: (socket: Socket, messageId: string, message: string) => void, pinMessage: (socket: Socket, roomId: string, messageId: string) => void, unpinMessage: (socket: Socket, roomId: string, messageId: string) => void, getPinnedMessages: (socket: Socket, roomId: string) => void, createSearchOverlay: any, searchMessages: any, cleanup: () => void, showSettingsOverlay: () => void, showHelpDialog: () => void, showDrawMenu: () => void, enterDrawingMode: (channel: string) => void, updateStatusBar: () => void, updateUserTable: () => void, showFileSharing: () => void, updateTypingPreview: () => void, clearChatLog: () => void, messagePicker?: MessagePicker, tryJoinVoiceChannel?: (channelName: string) => boolean): (value: string) => Promise<void>;
