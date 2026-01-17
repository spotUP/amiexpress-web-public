/**
 * Command execution action handlers
 */
import type { Socket } from 'socket.io-client';
import type { CommandResult } from '../commands/types';
export declare function handleCommandActions(r: CommandResult, socket: Socket, state: any, onlineUsers: Map<string, any>, currentSearchOverlay: any, createSearchOverlay: any, searchMessages: any, addSystemMessage: any, replyToThread: any, pinMessage: any, unpinMessage: any, getPinnedMessages: any, screen: any, inputBox: any, cleanup: () => void, showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void): {
    handled: boolean;
};
