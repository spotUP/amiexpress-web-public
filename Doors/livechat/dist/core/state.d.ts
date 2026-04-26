import type { Channel, Message, ChannelMember, EventPrefs } from '../types';
import type { TypingBuffer } from '../ui/typing-preview';
/**
 * DM thread view as exposed to the door sidebar.
 * Mirrors the backend `dm-thread-list.handler.ts` payload.
 */
export interface DmThreadView {
    threadId: string;
    isGroup: boolean;
    /** Sidebar label (1:1: other user's username; group: comma-joined participants minus self). */
    displayName: string;
    /** Participant usernames excluding self. */
    participants: string[];
    /** Last activity unix-epoch seconds. */
    lastActivityAt: number;
    /** Optional preview of the most recent message. */
    lastMessage?: string;
}
/** Application state */
export interface AppState {
    running: boolean;
    currentChannel: string;
    inputBuffer: string;
    focusedPane: 'channels' | 'chat' | 'input';
    channels: Channel[];
    messages: Message[];
    members: ChannelMember[];
    typingBuffers: Map<number, TypingBuffer>;
    typingUsers: Set<number>;
    prefs: EventPrefs;
    lastMessageId: string | null;
    currentRoomMotd: string | null;
    /** Direct-message threads for the current user (sidebar source). */
    dmThreads: DmThreadView[];
    /** Active DM thread when the user has switched into a DM context. */
    currentDmThread: string | null;
}
/** Create initial state */
export declare function createInitialState(): AppState;
/** State mutations */
export declare function setChannel(state: AppState, channelId: string): void;
/**
 * Switch into a DM thread context.
 *
 * Clears the chat log and any in-progress typing buffers. The caller is
 * responsible for fetching `chat:dm-history` and re-rendering the sidebar
 * to highlight the new active thread.
 *
 * Also clears `currentChannel` so the room:leave guard in handleChannelSelect
 * (`if (state.currentChannel) socket.emit('room:leave')`) doesn't re-emit
 * room:leave on subsequent DM->DM switches.
 */
export declare function setDmContext(state: AppState, threadId: string): void;
/**
 * Leave any DM context and return to the channel-based view. Called when
 * the user clicks a #channel in the sidebar after having been in a DM.
 */
export declare function clearDmContext(state: AppState): void;
export declare function addMessage(state: AppState, msg: Message): void;
export declare function clearInput(state: AppState): void;
export declare function appendInput(state: AppState, char: string): void;
export declare function backspaceInput(state: AppState): void;
