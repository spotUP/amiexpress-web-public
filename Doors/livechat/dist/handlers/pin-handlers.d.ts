/**
 * Pin socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';
export declare function setupPinListeners(socket: Socket, onPinUpdated: (data: any) => void, onPinList: (data: any) => void): void;
export declare function pinMessage(socket: Socket, roomId: string, messageId: number): void;
export declare function unpinMessage(socket: Socket, roomId: string, messageId: number): void;
export declare function getPinnedMessages(socket: Socket, roomId: string): void;
export declare function cleanupPinListeners(socket: Socket): void;
