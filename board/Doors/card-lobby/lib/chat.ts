/**
 * Talking in the lobby.
 *
 * "i see no chat while playing in fullscreen responsive? maybe cardlobby
 * never had a chat in the lobby?" (sysop, 2026-09-02). It never had one: the
 * ACTIVITY panel is an event log the door writes, and nothing carried a word
 * a player typed.
 *
 * The transport is the one the door already has. Tables, hands and the
 * activity feed all live in the shared LobbyState, which every node writes
 * and re-reads on the refresh timer (managers/UnoEventBus.ts) - so a message
 * appended here reaches the other nodes the same way a table does, with no
 * second channel to keep alive.
 *
 * Chat is kept apart from `events` rather than folded into it: the feed is
 * the door talking (seats, deals, wins) and this is people talking, and a
 * player scanning for a reply should not have to read past six "BOT 3 folds".
 */

import type { LobbyState } from './types';

/** One line somebody said. */
export interface ChatMessage {
  /** Unique per message, so a node can tell what it has already shown. */
  id: string;
  userId: string;
  username: string;
  text: string;
  /** Epoch millis, for the timestamp beside the name. */
  at: number;
  /** The table it was said at, or undefined for the lobby floor. */
  tableId?: number;
}

/**
 * How many messages the shared state carries.
 *
 * The state is written whole on every persist, so this is a size limit as
 * much as a history: 60 lines is more than a panel shows and small enough
 * that nobody notices the write.
 */
export const MAX_CHAT_MESSAGES = 60;

/** The longest thing a player can say in one go. */
export const MAX_CHAT_LENGTH = 200;

/** A message id that is unique across nodes without a shared counter. */
function chatId(userId: string): string {
  return `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Say something. Returns the message, or null when there was nothing to say.
 *
 * Trimming is the whole of the validation: a blank line costs a write and a
 * row in everyone's panel and says nothing.
 */
export function say(
  lobby: LobbyState,
  author: { userId: string; username: string },
  text: string,
  tableId?: number,
): ChatMessage | null {
  const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
  if (!trimmed) return null;

  const message: ChatMessage = {
    id: chatId(author.userId),
    userId: author.userId,
    username: author.username,
    text: trimmed,
    at: Date.now(),
    ...(tableId === undefined ? {} : { tableId }),
  };

  if (!lobby.chat) lobby.chat = [];
  lobby.chat.push(message);
  if (lobby.chat.length > MAX_CHAT_MESSAGES) {
    lobby.chat = lobby.chat.slice(-MAX_CHAT_MESSAGES);
  }
  return message;
}

/**
 * The messages this node has not shown yet.
 *
 * Ids rather than timestamps: two nodes can write inside the same
 * millisecond, and a clock that disagrees between nodes would drop or repeat
 * a line. An id that is no longer in the list (it aged out) means everything
 * held is new.
 */
export function messagesSince(lobby: LobbyState | null, lastSeenId: string | null): ChatMessage[] {
  const chat = lobby?.chat ?? [];
  if (!lastSeenId) return chat.slice();

  const at = chat.findIndex((message) => message.id === lastSeenId);
  return at === -1 ? chat.slice() : chat.slice(at + 1);
}

/** hh:mm, the way a BBS chat has always stamped a line. */
export function chatClock(at: number): string {
  const when = new Date(at);
  return `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
}

/**
 * One line ready for a panel: the time, the name, and what was said.
 *
 * `you` gets the accent so a player can find their own words; everyone else
 * is drawn in the name colour. Tags are the theme's, not literals, so the
 * line follows a theme change like the rest of the door.
 */
export function formatChatLine(
  message: ChatMessage,
  theme: { accent: string; accentAlt: string; dim: string },
  currentUserId: string,
): string {
  const nameColour = message.userId === currentUserId ? theme.accent : theme.accentAlt;
  return `{${theme.dim}-fg}${chatClock(message.at)}{/} `
    + `{${nameColour}-fg}${message.username}:{/} ${message.text}`;
}
