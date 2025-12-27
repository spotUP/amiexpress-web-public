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

/** Map emoji codes to ASCII display */
export const EMOJI_DISPLAY: Record<string, string> = {
  '+1': '[+]',
  '-1': '[-]',
  'heart': '<3',
  'fire': '*F*',
  'laugh': ':D',
  'wow': ':O',
  'sad': ':(',
  'angry': '>:('
};
