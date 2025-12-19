/** ASCII Emoji Registry for LiveChat */

export interface Emoji {
  code: string;        // :smile:
  ascii: string;       // :-)
  category: string;    // emotions, actions, symbols
  keywords: string[];  // [happy, grin, joy]
}

/** Built-in ASCII emojis */
export const EMOJI_REGISTRY: Emoji[] = [
  // Emotions - Happy
  { code: ':smile:', ascii: ':-)', category: 'emotions', keywords: ['happy', 'grin'] },
  { code: ':grin:', ascii: ':D', category: 'emotions', keywords: ['big smile', 'laugh'] },
  { code: ':joy:', ascii: 'XD', category: 'emotions', keywords: ['laugh', 'lol'] },
  { code: ':wink:', ascii: ';-)', category: 'emotions', keywords: ['flirt'] },
  { code: ':heart:', ascii: '<3', category: 'emotions', keywords: ['love'] },
  { code: ':kiss:', ascii: ':-*', category: 'emotions', keywords: ['love', 'smooch'] },

  // Emotions - Sad
  { code: ':sad:', ascii: ':-(', category: 'emotions', keywords: ['unhappy', 'frown'] },
  { code: ':cry:', ascii: ":'-(", category: 'emotions', keywords: ['tears', 'sob'] },
  { code: ':broken:', ascii: '</3', category: 'emotions', keywords: ['heartbreak', 'sad'] },

  // Emotions - Surprise
  { code: ':shock:', ascii: ':O', category: 'emotions', keywords: ['surprised', 'wow'] },
  { code: ':gasp:', ascii: 'O_O', category: 'emotions', keywords: ['amazed'] },

  // Emotions - Anger
  { code: ':angry:', ascii: '>:-(', category: 'emotions', keywords: ['mad', 'furious'] },
  { code: ':rage:', ascii: '>:O', category: 'emotions', keywords: ['mad', 'angry'] },

  // Expressions
  { code: ':neutral:', ascii: ':-|', category: 'emotions', keywords: ['meh', 'blank'] },
  { code: ':confused:', ascii: ':-/', category: 'emotions', keywords: ['puzzled'] },
  { code: ':thinking:', ascii: ':-?', category: 'emotions', keywords: ['hmm', 'ponder'] },
  { code: ':cool:', ascii: 'B-)', category: 'emotions', keywords: ['sunglasses', 'awesome'] },
  { code: ':nerd:', ascii: '8-)', category: 'emotions', keywords: ['glasses', 'geek'] },
  { code: ':sleep:', ascii: '|-)', category: 'emotions', keywords: ['tired', 'zzz'] },
  { code: ':dead:', ascii: 'X-X', category: 'emotions', keywords: ['rip', 'gone'] },
  { code: ':tongue:', ascii: ':-P', category: 'emotions', keywords: ['silly', 'playful'] },

  // Actions - Table flip family
  { code: ':tableflip:', ascii: '(╯°□°)╯︵ ┻━┻', category: 'actions', keywords: ['rage', 'flip', 'angry'] },
  { code: ':unflip:', ascii: '┬─┬ノ( º _ ºノ)', category: 'actions', keywords: ['calm', 'fix'] },
  { code: ':shrug:', ascii: '¯\\_(ツ)_/¯', category: 'actions', keywords: ['dunno', 'whatever'] },
  { code: ':fight:', ascii: '(ง°ل͜°)ง', category: 'actions', keywords: ['battle', 'fite'] },
  { code: ':flex:', ascii: 'ᕦ(ò_óˇ)ᕤ', category: 'actions', keywords: ['strong', 'muscle'] },
  { code: ':dance:', ascii: '┏(-_-)┛┗(-_- )┓', category: 'actions', keywords: ['party'] },
  { code: ':hug:', ascii: '(づ｡◕‿‿◕｡)づ', category: 'actions', keywords: ['cuddle', 'embrace'] },
  { code: ':wave:', ascii: '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', category: 'actions', keywords: ['hi', 'hello'] },
  { code: ':facepalm:', ascii: '(－‸ლ)', category: 'actions', keywords: ['ugh', 'disappointed'] },

  // Symbols - Hands
  { code: ':thumbsup:', ascii: '(Y)', category: 'symbols', keywords: ['yes', 'ok', 'good'] },
  { code: ':thumbsdown:', ascii: '(N)', category: 'symbols', keywords: ['no', 'bad'] },
  { code: ':clap:', ascii: '👏', category: 'symbols', keywords: ['applause', 'praise'] },
  { code: ':point:', ascii: '☞', category: 'symbols', keywords: ['finger', 'this'] },
  { code: ':ok:', ascii: '👌', category: 'symbols', keywords: ['perfect', 'good'] },
  { code: ':peace:', ascii: '✌', category: 'symbols', keywords: ['victory'] },

  // Symbols - Objects
  { code: ':star:', ascii: '★', category: 'symbols', keywords: ['favorite'] },
  { code: ':fire:', ascii: '🔥', category: 'symbols', keywords: ['hot', 'lit'] },
  { code: ':check:', ascii: '✓', category: 'symbols', keywords: ['yes', 'done'] },
  { code: ':x:', ascii: '✗', category: 'symbols', keywords: ['no', 'wrong'] },
  { code: ':arrow:', ascii: '→', category: 'symbols', keywords: ['next', 'point'] },
  { code: ':note:', ascii: '♪', category: 'symbols', keywords: ['music', 'song'] },
  { code: ':skull:', ascii: '☠', category: 'symbols', keywords: ['death', 'pirate'] },
  { code: ':radioactive:', ascii: '☢', category: 'symbols', keywords: ['danger', 'toxic'] },

  // Special
  { code: ':amiga:', ascii: '[A]', category: 'special', keywords: ['boing', 'retro'] },
  { code: ':bbs:', ascii: '[BBS]', category: 'special', keywords: ['board', 'system'] },
  { code: ':door:', ascii: '[=>]', category: 'special', keywords: ['game', 'app'] },
];

/** Emoji categories for picker */
export const EMOJI_CATEGORIES = ['emotions', 'actions', 'symbols', 'special'];

/** Get emoji by code */
export function getEmoji(code: string): Emoji | undefined {
  return EMOJI_REGISTRY.find(e => e.code === code);
}

/** Get emojis by category */
export function getEmojisByCategory(category: string): Emoji[] {
  return EMOJI_REGISTRY.filter(e => e.category === category);
}

/** Search emojis by keyword */
export function searchEmojis(query: string): Emoji[] {
  const q = query.toLowerCase();
  return EMOJI_REGISTRY.filter(e =>
    e.code.includes(q) ||
    e.keywords.some(k => k.includes(q))
  );
}

/** Replace emoji codes in text with ASCII */
export function replaceEmojis(text: string): string {
  let result = text;

  // Sort by code length (longest first) to avoid partial matches
  const sorted = [...EMOJI_REGISTRY].sort((a, b) => b.code.length - a.code.length);

  for (const emoji of sorted) {
    // Replace all occurrences (case insensitive)
    const regex = new RegExp(emoji.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, emoji.ascii);
  }

  return result;
}

/** Get all emoji codes for autocomplete */
export function getAllEmojiCodes(): string[] {
  return EMOJI_REGISTRY.map(e => e.code);
}

/** Format emoji for display in picker (code + ascii) */
export function formatEmojiDisplay(emoji: Emoji): string {
  return `${emoji.code.padEnd(18)} ${emoji.ascii}`;
}
