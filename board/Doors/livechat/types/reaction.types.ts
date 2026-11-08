/** Reaction on a message */
export interface Reaction {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  createdAt: Date;
}

/** Grouped reaction for display */
export interface ReactionGroup {
  emoji: string;
  count: number;
  users: number[];
  hasReacted: boolean;
}

/** Available emoji reactions */
export const REACTION_EMOJIS = [
  '+1',   // thumbs up
  '-1',   // thumbs down
  'heart',
  'fire',
  'laugh',
  'wow',
  'sad',
  'angry'
] as const;

/** Map reaction names to the ASCII face (latin1 and Amiga callers; also the fallback). */
export const EMOJI_DISPLAY: Record<string, string> = {
  '+1': ':)',
  '-1': ':/',
  'heart': '<3',
  'fire': '*',
  'laugh': ':D',
  'wow': ':O',
  'sad': ':(',
  'angry': '>('
};

/** Real emoji for callers whose wire is UTF-8 (BBSApi.unicodeCapable). Each is 2 terminal columns. */
export const EMOJI_UTF8: Record<string, string> = {
  '+1': '\u{1F44D}',
  '-1': '\u{1F44E}',
  'heart': '\u2764\uFE0F',
  'fire': '\u{1F525}',
  'laugh': '\u{1F602}',
  'wow': '\u{1F62E}',
  'sad': '\u{1F622}',
  'angry': '\u{1F620}'
};

/** Picker words, in the order of REACTION_EMOJIS. */
export const REACTION_WORDS = ['Thumbs Up', 'Thumbs Down', 'Heart', 'Fire', 'Laugh', 'Wow', 'Sad', 'Angry'] as const;
