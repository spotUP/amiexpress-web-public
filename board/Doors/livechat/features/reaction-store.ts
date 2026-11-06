/**
 * Reaction counts per message id.
 *
 * The backend stores reactions with the message and broadcasts the full
 * per-emoji counts of a message on every change (`chat:reaction`), and
 * attaches them to every history item of `room:joined`. This module is the
 * door's one copy of those counts; the renderer reads `formatReactionCounts`.
 */
import { EMOJI_DISPLAY } from '../types/reaction.types';

export type ReactionCounts = Record<string, number>;

const counts = new Map<string, ReactionCounts>();

/** Replace the counts of one message. An empty map clears it. */
export function setReactionCounts(messageId: string | number, next: ReactionCounts | undefined | null): void {
  const id = String(messageId);
  const clean: ReactionCounts = {};
  for (const [emoji, n] of Object.entries(next ?? {})) {
    if (Number.isFinite(n) && n > 0) clean[emoji] = n;
  }
  if (Object.keys(clean).length === 0) counts.delete(id);
  else counts.set(id, clean);
}

export function getReactionCounts(messageId: string | number): ReactionCounts {
  return counts.get(String(messageId)) ?? {};
}

/** Seed from a `room:joined` history array: items are `{ id, reactions? }`. */
export function seedReactionCounts(history: ReadonlyArray<{ id?: string | number; reactions?: ReactionCounts }>): void {
  for (const m of history) {
    if (m?.id !== undefined && m.id !== null) setReactionCounts(m.id, m.reactions);
  }
}

export function clearReactionCounts(): void {
  counts.clear();
}

/** ` [<3 2] [[+] 1]` style suffix for a message line; empty when none. */
export function formatReactionCounts(messageId: string | number): string {
  const entries = Object.entries(getReactionCounts(messageId));
  if (entries.length === 0) return '';
  return ' ' + entries.map(([emoji, n]) => `[${EMOJI_DISPLAY[emoji] ?? emoji} ${n}]`).join(' ');
}
