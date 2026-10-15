import type { Channel, Message, ChannelMember, EventPrefs } from '../types';
import { createMuteList, type MuteList } from './mute-list';
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
  /** Who the user has muted, ignored or blocked - see core/mute-list. */
  muteList: MuteList;
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
    currentRoomMotd: null,
    dmThreads: [],
    currentDmThread: null,
    muteList: createMuteList()
  };
}

/** State mutations */
export function setChannel(state: AppState, channelId: string): void {
  state.currentChannel = channelId;
  // Switching into a text channel implicitly leaves any DM context so
  // callers can't accidentally have both contexts active simultaneously.
  state.currentDmThread = null;
  state.messages = [];
  state.typingBuffers.clear();
}

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
export function setDmContext(state: AppState, threadId: string): void {
  state.currentDmThread = threadId;
  state.currentChannel = '';
  state.messages = [];
  state.typingBuffers.clear();
}

/**
 * Leave any DM context and return to the channel-based view. Called when
 * the user clicks a #channel in the sidebar after having been in a DM.
 */
export function clearDmContext(state: AppState): void {
  state.currentDmThread = null;
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
