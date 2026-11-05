/**
 * Chat log component
 * Main chat message display area
 */
import { Screen, DockablePanel, Log } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TYPING_HEIGHT } from './typing-preview';
export { TYPING_HEIGHT };
export declare function createChatLog(screen: Screen, sidebarWidth: number): {
    panel: DockablePanel;
    log: Log;
};
export declare function updateChatHeader(chatLog: Log, channelName: string): void;
/**
 * Add a BBS event announcement to the chat log
 */
export declare function addBBSEvent(chatLog: Log, formattedEvent: string): void;
