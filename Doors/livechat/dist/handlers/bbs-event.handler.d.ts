/**
 * BBS Event Handler for LiveChat
 * Listens to BBS system events and displays them in the chat log
 */
import type { Socket } from 'socket.io-client';
import type { BBSEventPayload } from '../types/bbs-events';
export declare class BBSEventHandler {
    private socket;
    private eventCallback?;
    constructor(socket: Socket);
    /**
     * Register callback for BBS events
     */
    onEvent(callback: (event: BBSEventPayload) => void): void;
    /**
     * Start listening to BBS events from server
     */
    listen(): void;
    /**
     * Stop listening to BBS events
     */
    unlisten(): void;
    /**
     * Format event for display in chat log
     */
    formatEvent(event: BBSEventPayload): string;
}
