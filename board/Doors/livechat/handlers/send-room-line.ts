/**
 * Send one line to the current room and echo it locally. The one path for a
 * typed line and for /reply, so both emit the same event and paint the same row.
 */
import type { Socket } from 'socket.io-client';
import { formatTime } from '../utils/format';
import { parseContent } from '../utils/markdown';
import { getUserColor } from '../core/formatter';
import { formatReplyQuote, type ReplyParent } from '../core/reply-quote';
import { T } from '../door-theme';

export interface SendRoomLineDeps {
  socket: Socket;
  userId: number;
  username: string;
  addChatMessage: (msg: string, applyMarkdown?: boolean, messageId?: string) => void;
  inputHistory: { add: (id: string, text: string) => void };
  updateTypingPreview: () => void;
  /** Remember what a line said, so a later reply can quote it. */
  rememberMessage: (id: string, username: string, content: string) => void;
  /** The author and text of a message already on screen, by id. */
  lookupMessage: (id: string) => ReplyParent | undefined;
}

export function sendRoomLine(deps: SendRoomLineDeps, msg: string, replyTo?: string): void {
  const { socket, userId, username } = deps;
  const messageId = `${userId}-${Date.now()}`;
  socket.emit('room:message', { message: msg, messageId, clientId: messageId, ...(replyTo ? { replyTo } : {}) });

  // Local echo (the server skips echoing own messages back). The content is
  // parsed as it is for anyone else's line; the tags around it are ours.
  const parent = replyTo ? deps.lookupMessage(replyTo) : undefined;
  if (parent) deps.addChatMessage(formatReplyQuote(parent), false, messageId);
  const time = formatTime(new Date());
  const color = getUserColor(username);
  deps.addChatMessage(`{${T.dim}-fg}[${time}]{/${T.dim}-fg} <{${color}-fg}${username}{/${color}-fg}> ${parseContent(msg)}`, false, messageId);
  deps.rememberMessage(messageId, username, msg);

  deps.updateTypingPreview();
  deps.inputHistory.add(messageId, msg);
}
