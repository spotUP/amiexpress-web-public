/**
 * The chat messages a user actually SENT - not system lines, joins or leaves -
 * for the context menu's "View History" action. A pure module (no blessed / no
 * SDK imports) so it is unit-testable on its own.
 */
import type { Message } from '../types';

export function chatMessagesFrom(messages: Message[], username: string): Message[] {
  const u = (username || '').toLowerCase();
  return messages.filter(m => m.type === 'message' && (m.username || '').toLowerCase() === u);
}
