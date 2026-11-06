/**
 * Thread socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';
export declare function setupThreadListeners(socket: Socket, onThreadCreated: (data: any) => void, onThreadReply: (data: any) => void, onThreadMessages: (data: any) => void): void;
export declare function createThread(socket: Socket, messageId: string, title?: string): void;
export declare function replyToThread(socket: Socket, threadId: string, message: string): void;
export declare function getThreadMessages(socket: Socket, threadId: string): void;
export declare function cleanupThreadListeners(socket: Socket): void;
