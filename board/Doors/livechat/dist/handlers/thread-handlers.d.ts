/**
 * Thread socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';
export declare function setupThreadListeners(socket: Socket, onThreadCreated: (data: any) => void, onThreadReply: (data: any) => void, onThreadMessages: (data: any) => void): void;
export declare function createThread(socket: Socket, messageId: number, title?: string): void;
export declare function replyToThread(socket: Socket, threadId: number, message: string): void;
export declare function getThreadMessages(socket: Socket, threadId: number): void;
export declare function cleanupThreadListeners(socket: Socket): void;
