import type { BBSEvent } from '../types';
/** BBS Event Bus - broadcasts system events to chat */
export declare class BBSEventBus {
    private socket;
    constructor(socket: any);
    /** Emit a BBS event */
    emit(event: BBSEvent): void;
    /** User logged in */
    userLogin(userId: number, username: string, nodeId: number): void;
    /** User logged out */
    userLogout(userId: number, username: string): void;
    /** Upload started */
    uploadStart(userId: number, username: string, filename: string, size: string): void;
    /** Upload completed */
    uploadComplete(userId: number, username: string, filename: string, area: string): void;
    /** Download started */
    downloadStart(userId: number, username: string, filename: string): void;
}
