/**
 * A DECK AN ARTIST CAN DRAW.
 *
 * Until now a card's appearance was a set of enums - two styles, two sizes,
 * four backs - and every board got the same deck. csol
 * (https://github.com/nielssp/csol, MIT) reads its cards out of a theme file
 * instead, and on a board whose sysop hand-draws its ANSI and PETSCII that is
 * plainly the right way round.
 *
 * The format is csol's, so its themes load unchanged:
 *
 *     theme {
 *       name corners
 *       title "Suit and rank in the four corners"
 *       heart ♥  spade ♠  diamond ♦  club ♣
 *       width 6
 *       height 4
 *       empty { top ┌────┐  middle │    │  bottom └────┘  fg white bg black }
 *       back  { top ┌────┐  middle │    │  bottom └────┘  fg white bg blue  }
 *       red   { top ┌────┐  middle │    │  bottom └────┘  fg red   bg white
 *               text { format rank }
 *               text { x -1  format suit  align right }
 *       }
 *       black { ... }
 *     }
 *
 * A card is `height` rows: the `top` line, `height - 2` copies of `middle`,
 * then `bottom`. Each `text` block stamps the rank, the suit or both onto the
 * frame at a position - and a NEGATIVE x or y counts back from the right or
 * the bottom, which is how the same four blocks put a rank and suit in all
 * four corners of a card whatever its size.
 */

export type ThemeTextFormat = 'rank' | 'suit' | 'both';
export type ThemeAlign = 'left' | 'right';

export interface ThemeText {
  /** Column; negative counts back from the right edge. */
  x: number;
  /** Row; negative counts back from the bottom. */
  y: number;
  format: ThemeTextFormat;
  align: ThemeAlign;
}

export interface ThemeLayout {
  top: string;
  middle: string;
  bottom: string;
  fg?: string;
  bg?: string;
  text: ThemeText[];
}

export interface CardTheme {
  name: string;
  title: string;
  width: number;
  height: number;
  /** The glyph each suit is drawn with; a board may prefer letters. */
  suits: { heart: string; spade: string; diamond: string; club: string };
  empty: ThemeLayout;
  back: ThemeLayout;
  red: ThemeLayout;
  black: ThemeLayout;
}

// ============================================================================
// Reading
// ============================================================================

/**
 * LINE BY LINE, not word by word.
 *
 * A layout line is `middle │    │` - the value carries spaces INSIDE it,
 * because that is the middle of a card. A word tokenizer turns that into two
 * bars and loses the card, which is exactly what the first version of this
 * reader did to csol's own default theme. So each line is a key and the rest
 * of the line, verbatim, and only `{` and `}` are structural.
 */
interface ThemeLine {
  key: string;
  value: string;
  open: boolean;
  close: boolean;
}

function readLines(source: string): ThemeLine[] {
  const lines: ThemeLine[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;

    if (line === '}') { lines.push({ key: '', value: '', open: false, close: true }); continue; }

    const opens = line.endsWith('{');
    const body = opens ? line.slice(0, -1).trim() : line;
    const space = body.search(/\s/);
    const key = space < 0 ? body : body.slice(0, space);
    let value = space < 0 ? '' : body.slice(space + 1).trim();

    // A title may be quoted; nothing else in the format needs to be.
    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      value = value.slice(1, -1);
    }

    lines.push({ key, value, open: opens, close: false });
  }
  return lines;
}

const EMPTY_LAYOUT: ThemeLayout = { top: '', middle: '', bottom: '', text: [] };

function parseText(lines: ThemeLine[], at: { i: number }): ThemeText {
  const text: ThemeText = { x: 0, y: 0, format: 'rank', align: 'left' };
  while (at.i < lines.length && !lines[at.i].close) {
    const line = lines[at.i];
    at.i += 1;
    switch (line.key) {
      case 'x': text.x = parseInt(line.value, 10) || 0; break;
      case 'y': text.y = parseInt(line.value, 10) || 0; break;
      case 'format': text.format = line.value as ThemeTextFormat; break;
      case 'align': text.align = line.value as ThemeAlign; break;
      default: break;
    }
  }
  at.i += 1;                                   // past the closing brace
  return text;
}

function parseLayout(lines: ThemeLine[], at: { i: number }): ThemeLayout {
  const layout: ThemeLayout = { top: '', middle: '', bottom: '', text: [] };
  while (at.i < lines.length && !lines[at.i].close) {
    const line = lines[at.i];
    at.i += 1;
    if (line.key === 'text' && line.open) { layout.text.push(parseText(lines, at)); continue; }
    switch (line.key) {
      case 'top': layout.top = line.value; break;
      case 'middle': layout.middle = line.value; break;
      case 'bottom': layout.bottom = line.value; break;
      case 'fg': layout.fg = line.value; break;
      case 'bg': layout.bg = line.value; break;
      default: break;
    }
  }
  at.i += 1;
  return layout;
}

export function parseCardTheme(source: string): CardTheme {
  const lines = readLines(source);
  const at = { i: 0 };

  if (lines.length === 0 || lines[0].key !== 'theme' || !lines[0].open) {
    throw new Error('A card theme starts with `theme {`');
  }
  at.i = 1;

  const theme: CardTheme = {
    name: '',
    title: '',
    width: 6,
    height: 4,
    suits: { heart: '\u2665', spade: '\u2660', diamond: '\u2666', club: '\u2663' },
    empty: { top: '', middle: '', bottom: '', text: [] },
    back: { top: '', middle: '', bottom: '', text: [] },
    red: { top: '', middle: '', bottom: '', text: [] },
    black: { top: '', middle: '', bottom: '', text: [] },
  };

  while (at.i < lines.length && !lines[at.i].close) {
    const line = lines[at.i];
    at.i += 1;

    if (line.open && (line.key === 'empty' || line.key === 'back' || line.key === 'red' || line.key === 'black')) {
      theme[line.key] = parseLayout(lines, at);
      continue;
    }

    switch (line.key) {
      case 'name': theme.name = line.value; break;
      case 'title': theme.title = line.value; break;
      case 'width': theme.width = parseInt(line.value, 10) || theme.width; break;
      case 'height': theme.height = parseInt(line.value, 10) || theme.height; break;
      case 'heart': theme.suits.heart = line.value; break;
      case 'spade': theme.suits.spade = line.value; break;
      case 'diamond': theme.suits.diamond = line.value; break;
      case 'club': theme.suits.club = line.value; break;
      default: break;
    }
  }

  if (!theme.name) throw new Error('A card theme needs a name');
  if (!theme.title) theme.title = theme.name;
  if (!theme.red.top && !theme.black.top) {
    throw new Error(`Card theme "${theme.name}" draws no cards: it needs a red and a black layout`);
  }
  return theme;
}

// ============================================================================
// Drawing
// ============================================================================

const SUIT_KIND: Record<string, 'heart' | 'spade' | 'diamond' | 'club'> = {
  '♥': 'heart', H: 'heart', h: 'heart',
  '♠': 'spade', S: 'spade', s: 'spade',
  '♦': 'diamond', D: 'diamond', d: 'diamond',
  '♣': 'club', C: 'club', c: 'club',
};

const isRedSuit = (suit: string): boolean => {
  const kind = SUIT_KIND[suit];
  return kind === 'heart' || kind === 'diamond';
};

/** Write `text` into `line` at `column`, keeping the line's width. */
function stamp(line: string, column: number, text: string): string {
  const padded = line.padEnd(column + text.length, ' ');
  return padded.slice(0, column) + text + padded.slice(column + text.length);
}

export interface ThemedCardOptions {
  /** 'front' draws the rank and suit; 'back' and 'empty' draw their layouts. */
  face?: 'front' | 'back' | 'empty';
}

/**
 * Draw one card with a theme.
 *
 * Returns the card's rows, without colour - the caller decides whether its
 * terminal wants ANSI, and the theme's `fg`/`bg` are carried on the layout
 * for it to read.
 */
export function renderThemedCardLines(
  card: { rank: string; suit: string },
  theme: CardTheme,
  options: ThemedCardOptions = {},
): string[] {
  const face = options.face ?? 'front';
  const layout = face === 'back' ? theme.back
    : face === 'empty' ? theme.empty
      : isRedSuit(card.suit) ? theme.red : theme.black;

  const height = Math.max(2, theme.height);
  const lines: string[] = [layout.top];
  for (let row = 1; row < height - 1; row += 1) lines.push(layout.middle);
  lines.push(layout.bottom);

  // A back or an empty slot carries no rank and no suit.
  if (face !== 'front') return lines.map((line) => line.padEnd(theme.width, ' '));

  const suitKind = SUIT_KIND[card.suit];
  const suitGlyph = suitKind ? theme.suits[suitKind] : card.suit;

  for (const text of layout.text) {
    const value = text.format === 'rank' ? card.rank
      : text.format === 'suit' ? suitGlyph
        : `${card.rank}${suitGlyph}`;

    /*
     * Negative positions count from the far edge, which is what lets ONE
     * theme put a rank and suit in all four corners of a card whatever its
     * size - csol's `corners` theme is four `text` blocks and nothing else.
     */
    const row = text.y < 0 ? lines.length + text.y : text.y;
    if (row < 0 || row >= lines.length) continue;

    const rawColumn = text.x < 0 ? theme.width + text.x : text.x;
    const column = text.align === 'right' ? rawColumn - value.length + 1 : rawColumn;
    if (column < 0) continue;

    lines[row] = stamp(lines[row], column, value);
  }

  return lines.map((line) => line.padEnd(theme.width, ' '));
}
