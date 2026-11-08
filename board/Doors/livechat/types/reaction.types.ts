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

/** Map reaction names to the text face every caller sees. */
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

/** Picker words, in the order of REACTION_EMOJIS. */
export const REACTION_WORDS = ['Thumbs Up', 'Thumbs Down', 'Heart', 'Fire', 'Laugh', 'Wow', 'Sad', 'Angry'] as const;
