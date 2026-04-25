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
  currentRoomMotd: string | null;
}

/** Create initial state */
export function createInitialState(): AppState {
  return {
    running: true,
    currentChannel: '',  // Empty until user actually joins a room
    inputBuffer: '',
    focusedPane: 'input',
    channels: [],
    messages: [],
    members: [],
    typingBuffers: new Map(),
    typingUsers: new Set(),
    prefs: {
      showLogins: true,
      showFileActivity: true,
      showDoorActivity: true,
      showMessages: true,
      showSystemAnnouncements: true,
      muteAllEvents: false,
      compactMode: false,
      showTimestamps: true,
      notificationSound: true,
      mentionSound: true
    },
    lastMessageId: null,
    currentRoomMotd: null
  };
}

/** State mutations */
export function setChannel(state: AppState, channelId: string): void {
  state.currentChannel = channelId;
  state.messages = [];
  state.typingBuffers.clear();
}

export function addMessage(state: AppState, msg: Message): void {
  state.messages.push(msg);
  state.lastMessageId = msg.id;
  if (state.messages.length > 100) {
    state.messages.shift();
  }
}

export function clearInput(state: AppState): void {
  state.inputBuffer = '';
}

export function appendInput(state: AppState, char: string): void {
  state.inputBuffer += char;
}

export function backspaceInput(state: AppState): void {
  state.inputBuffer = state.inputBuffer.slice(0, -1);
}
