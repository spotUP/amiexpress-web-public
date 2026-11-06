/**
 * A reply is a room line with a parent. The quote row shown above it is built
 * here, once, for the sender's local echo and for lines arriving from others.
 */
import { T } from '../door-theme';
import { escapeContent } from '../utils/format';

export interface ReplyParent {
  username: string;
  content: string;
}

const SNIPPET_LENGTH = 60;

/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
export function formatReplyQuote(parent: ReplyParent): string {
  const flat = String(parent.content ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
  return `{${T.dim}-fg}  > ${escapeContent(parent.username)}: ${escapeContent(flat)}{/${T.dim}-fg}`;
}
