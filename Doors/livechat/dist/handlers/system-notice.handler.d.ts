/**
 * System notices from the BBS itself (currently: an imminent restart).
 *
 * The server cannot write these as raw ANSI while this door is running - that
 * paints over the blessed screen - so it sends a structured 'system:notice'
 * event instead and the door renders it through its own message log.
 */
export interface SystemNotice {
    kind: string;
    seconds?: number;
    message?: string;
}
export declare function setupSystemNoticeHandler(sock: any, addSystemMessage: (msg: string) => void, audio?: {
    playSound?: (name: string) => void;
}): void;
