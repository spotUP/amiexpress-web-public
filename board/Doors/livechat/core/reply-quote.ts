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

/** The flat, clipped text of a parent: one row, no newlines. */
function snippet(parent: ReplyParent): string {
  return String(parent.content ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
}

/**
 * What the context menu's Quote puts in the input box: `> <user>: <text> `,
 * plain text, cursor after it, ready for the caller's own words. Quote used to
 * put only `> ` there, so the sent line said nothing about what was quoted.
 */
export function quoteInputText(parent: ReplyParent): string {
  return `> ${parent.username}: ${snippet(parent)} `;
}

/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
export function formatReplyQuote(parent: ReplyParent): string {
  const flat = snippet(parent);
  return `{${T.dim}-fg}  > ${escapeContent(parent.username)}: ${escapeContent(flat)}{/${T.dim}-fg}`;
}
