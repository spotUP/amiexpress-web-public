/**
 * Search socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';
export declare function setupSearchListeners(socket: Socket, onResults: (data: any) => void): void;
export declare function searchMessages(socket: Socket, query: string, filters?: {
    roomId?: string;
    username?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
}): void;
export declare function cleanupSearchListeners(socket: Socket): void;
