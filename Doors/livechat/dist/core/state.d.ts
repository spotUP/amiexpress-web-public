import type { Channel, Message, ChannelMember, EventPrefs } from '../types';
import type { TypingBuffer } from '../ui/typing-preview';
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
}
/** Create initial state */
export declare function createInitialState(): AppState;
/** State mutations */
export declare function setChannel(state: AppState, channelId: string): void;
export declare function addMessage(state: AppState, msg: Message): void;
export declare function clearInput(state: AppState): void;
export declare function appendInput(state: AppState, char: string): void;
export declare function backspaceInput(state: AppState): void;
