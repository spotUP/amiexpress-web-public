/**
 * Emoji Registry and Replacement System
 * 50+ built-in ASCII emojis across 4 categories
 */

export interface Emoji {
  code: string;       // :smile:
  display: string;    // :-)
  keywords: string[]; // happy, grin
  category: 'emotions' | 'actions' | 'symbols' | 'special';
}

export const EMOJIS: Emoji[] = [
  // Emotions (18)
  { code: ':smile:', display: ':-)', keywords: ['happy', 'grin'], category: 'emotions' },
  { code: ':grin:', display: ':D', keywords: ['big', 'smile', 'laugh'], category: 'emotions' },
  { code: ':joy:', display: 'XD', keywords: ['laugh', 'lol'], category: 'emotions' },
  { code: ':wink:', display: ';-)', keywords: ['flirt'], category: 'emotions' },
  { code: ':heart:', display: '<3', keywords: ['love'], category: 'emotions' },
  { code: ':sad:', display: ':-(', keywords: ['unhappy', 'frown'], category: 'emotions' },
  { code: ':cry:', display: ':\'-(' , keywords: ['tears', 'sob'], category: 'emotions' },
  { code: ':shock:', display: ':O', keywords: ['surprised', 'wow'], category: 'emotions' },
  { code: ':angry:', display: '>:-(', keywords: ['mad', 'furious'], category: 'emotions' },
  { code: ':cool:', display: 'B-)', keywords: ['sunglasses', 'awesome'], category: 'emotions' },
  { code: ':tongue:', display: ':P', keywords: ['playful', 'silly'], category: 'emotions' },
  { code: ':kiss:', display: ':-*', keywords: ['love', 'romance'], category: 'emotions' },
  { code: ':blush:', display: ':-}', keywords: ['shy', 'embarrassed'], category: 'emotions' },
  { code: ':confused:', display: ':-/', keywords: ['unsure', 'puzzled'], category: 'emotions' },
  { code: ':neutral:', display: ':-|', keywords: ['meh', 'okay'], category: 'emotions' },
  { code: ':surprised:', display: ':o', keywords: ['wow', 'shocked'], category: 'emotions' },
  { code: ':evil:', display: '>:-)', keywords: ['devil', 'mischief'], category: 'emotions' },
  { code: ':angel:', display: 'O:-)', keywords: ['innocent', 'halo'], category: 'emotions' },

  // Actions (9) -- ASCII-only kaomoji. The original Unicode kaomoji used
  // Japanese and box-drawing chars that don't render on Amiga clients
  // or ASCII-strict terminals. ASCII approximations below stay in the
  // printable 0x20-0x7E range so messages render identically across
  // every terminal type the BBS supports.
  { code: ':tableflip:', display: '(>_<)~~ |[__]|', keywords: ['rage', 'flip', 'angry'], category: 'actions' },
  { code: ':unflip:', display: '|---| (-_-)', keywords: ['calm', 'fix'], category: 'actions' },
  { code: ':shrug:', display: '\\(o.O)/', keywords: ['dunno', 'whatever'], category: 'actions' },
  { code: ':fight:', display: '(>_<)*', keywords: ['battle', 'fite'], category: 'actions' },
  { code: ':dance:', display: '\\(^o^)/', keywords: ['party'], category: 'actions' },
  { code: ':hug:', display: '(>^_^)<', keywords: ['cuddle', 'embrace'], category: 'actions' },
  { code: ':run:', display: '(>_>)===>', keywords: ['flee', 'escape'], category: 'actions' },
  { code: ':wave:', display: '(^.^)/', keywords: ['hello', 'bye'], category: 'actions' },
  { code: ':facepalm:', display: '(>_<;)', keywords: ['disappointed', 'sigh'], category: 'actions' },
  // Symbols (13)
  { code: ':thumbsup:', display: '(Y)', keywords: ['yes', 'ok', 'good'], category: 'symbols' },
  { code: ':thumbsdown:', display: '(N)', keywords: ['no', 'bad'], category: 'symbols' },
  // ASCII-only displays. Project convention (CLAUDE.md "BBS Output
  // Conventions") forbids Unicode for content that flows through the
  // chat log -- Amiga clients and ASCII-strict terminals can't render
  // ★ / ✓ / 🔥 / ⚡ / ♥ etc. Use the closest ASCII equivalent so the
  // message is identical regardless of terminal capability.
  { code: ':fire:', display: '(*)', keywords: ['hot', 'lit'], category: 'symbols' },
  { code: ':star:', display: '*', keywords: ['favorite'], category: 'symbols' },
  { code: ':check:', display: '[v]', keywords: ['yes', 'done'], category: 'symbols' },
  { code: ':x:', display: '[x]', keywords: ['no', 'fail'], category: 'symbols' },
  { code: ':skull:', display: '8X', keywords: ['death', 'pirate'], category: 'symbols' },
  { code: ':music:', display: '~o~', keywords: ['song', 'note'], category: 'symbols' },
  { code: ':heart2:', display: '<3', keywords: ['love', 'like'], category: 'symbols' },
  { code: ':diamond:', display: '<>', keywords: ['gem', 'shine'], category: 'symbols' },
  { code: ':arrow:', display: '->', keywords: ['next', 'go'], category: 'symbols' },
  { code: ':warning:', display: '(!)', keywords: ['caution', 'alert'], category: 'symbols' },
  { code: ':lightning:', display: '/!\\', keywords: ['power', 'fast'], category: 'symbols' },

  // Special (3)
  { code: ':amiga:', display: '[A]', keywords: ['boing', 'retro', 'computer'], category: 'special' },
  { code: ':bbs:', display: '[BBS]', keywords: ['board', 'system'], category: 'special' },
  { code: ':door:', display: '[=>]', keywords: ['game', 'app'], category: 'special' },
];

/** Get all emojis in a category */
export function getEmojisByCategory(category: Emoji['category']): Emoji[] {
  return EMOJIS.filter(e => e.category === category);
}

/** Search emojis by keyword */
export function searchEmojis(query: string): Emoji[] {
  const lower = query.toLowerCase();
  return EMOJIS.filter(e =>
    e.code.toLowerCase().includes(lower) ||
    e.keywords.some(k => k.toLowerCase().includes(lower))
  );
}

/** Get all categories */
export function getCategories(): Emoji['category'][] {
  return ['emotions', 'actions', 'symbols', 'special'];
}

/** Replace :emoji: codes with display characters */
export function replaceEmojis(text: string): string {
  let result = text;
  for (const emoji of EMOJIS) {
    result = result.replace(new RegExp(escapeRegex(emoji.code), 'g'), emoji.display);
  }
  return result;
}

/** Escape regex special characters */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Get emoji by code */
export function getEmoji(code: string): Emoji | undefined {
  return EMOJIS.find(e => e.code === code);
}

/** Get autocomplete suggestions */
export function getAutocompleteSuggestions(partial: string): Emoji[] {
  if (!partial.startsWith(':')) return [];
  const lower = partial.toLowerCase();
  return EMOJIS.filter(e => e.code.toLowerCase().startsWith(lower)).slice(0, 10);
}
