import type { Message, DisplayMessage, ReactionGroup, EventPrefs } from '../types';
import { EMOJI_DISPLAY } from '../types';
import { formatTime } from '../utils/format';
import { parseContent } from '../utils/markdown';
import { highlightMentions } from '../utils/mentions';
import { color, bold, userName } from '../utils/ansi';

/** Format a message for display */
export function formatMessage(msg: Message, currentUser: string, compact: boolean): string {
  const time = compact ? '' : `{gray-fg}[${formatTime(msg.createdAt)}]{/} `;
  const name = userName(msg.username, getUserColor(msg.username));
  let content = parseContent(msg.content);
  content = highlightMentions(content, currentUser);

  if (msg.type === 'action') {
    return `${time}{magenta-fg}* ${msg.username} ${content}{/}`;
  }

  return `${time}${name}: ${content}`;
}

/** Format reactions */
export function formatReactions(reactions: ReactionGroup[]): string {
  if (!reactions.length) return '';
  return ' ' + reactions.map(r => {
    const emoji = EMOJI_DISPLAY[r.emoji] || r.emoji;
    return `{cyan-fg}[${emoji}${r.count > 1 ? r.count : ''}]{/}`;
  }).join(' ');
}

/** Format system message */
export function formatSystemMessage(text: string): string {
  return color(`*** ${text}`, 'gray');
}

/** Get consistent color for username */
export function getUserColor(username: string): string {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/** Format thread indicator */
export function formatThread(replyCount: number): string {
  if (replyCount <= 0) return '';
  return ` {gray-fg}[${replyCount} replies]{/}`;
}

/** Format pinned indicator */
export function formatPinned(isPinned: boolean): string {
  return isPinned ? ' {cyan-fg}[PIN]{/}' : '';
}
