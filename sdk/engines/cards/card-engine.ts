/**
 * Card Engine - ASCII/Unicode Playing Cards and UNO Rendering
 *
 * Render playing cards, hands, and stacks as fixed-width ASCII/ANSI art.
 *
 * @example
 * ```typescript
 * import { CardEngine } from '@amiexpress/bbs-door-sdk';
 *
 * const cards = new CardEngine(); // defaults to ASCII + ANSI colors
 * const hand = cards.buildStandardDeck().slice(0, 5);
 * const art = cards.renderHand(hand, { layout: 'flat-condensed' });
 *
 * await ctx.output.write(art + '\r\n');
 * ```
 */

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type SuitSymbol = "\u2660" | "\u2665" | "\u2666" | "\u2663";
export type SuitAscii = "S" | "H" | "D" | "C";
export type Suit = SuitSymbol | SuitAscii;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type CardStyle = "unicode" | "ascii";
export type CardSize = "full" | "mini";
export type CardFace = "front" | "back";
export type BackStyle = "lined" | "dotted" | "classic" | "shiny";
export type ColorMode = "none" | "ansi";

export interface RenderOptions {
  style?: CardStyle;
  size?: CardSize;
  face?: CardFace;
  backStyle?: BackStyle;
  color?: ColorMode;
  /**
   * Optional custom backside content (array of lines without borders, max width 9).
   * If provided, overrides the selected backStyle.
   */
  customBackLines?: string[];
}

export type UnoColor = "R" | "G" | "B" | "Y" | "W";
export type UnoValue =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4";

export interface UnoCard {
  color: UnoColor;
  value: UnoValue;
}

export interface UnoRenderOptions extends RenderOptions {}

export interface UnoStackCard extends UnoCard {
  face?: CardFace;
  backStyle?: BackStyle;
  style?: CardStyle;
  size?: CardSize;
}

export type HandLayout = "flat" | "flat-condensed" | "arch" | "arch-condensed";

export interface HandRenderOptions extends RenderOptions {
  layout?: HandLayout;
  /**
   * Horizontal step between cards. If omitted, a sensible default is chosen per layout.
   */
  spacing?: number;
}

export interface StackCard extends Card {
  face?: CardFace;
  backStyle?: BackStyle;
  style?: CardStyle;
  size?: CardSize;
}

export interface StackRenderOptions extends RenderOptions {
  /**
   * Number of lines to offset each successive card downward.
   */
  overlap?: number;
}

export interface CardEngineOptions {
  render?: RenderOptions;
  hand?: HandRenderOptions;
  stack?: StackRenderOptions;
  uno?: UnoRenderOptions;
}

export class CardEngine {
  private renderDefaults: RenderOptions;
  private handDefaults: HandRenderOptions;
  private stackDefaults: StackRenderOptions;
  private unoDefaults: UnoRenderOptions;

  constructor(options: CardEngineOptions = {}) {
    this.renderDefaults = { ...(options.render ?? {}) };
    this.handDefaults = { ...(options.hand ?? {}) };
    this.stackDefaults = { ...(options.stack ?? {}) };
    this.unoDefaults = { ...(options.uno ?? {}) };
  }

  public renderCard(card: Card, options?: RenderOptions): string {
    return renderCard(card, this.mergeRender(options));
  }

  public renderCardLines(card: Card, options?: RenderOptions): string[] {
    return renderCardLines(card, this.mergeRender(options));
  }

  public renderHand(cards: Card[], options?: HandRenderOptions): string {
    return renderHand(cards, this.mergeHand(options));
  }

  public renderHandLines(cards: Card[], options?: HandRenderOptions): string[] {
    return renderHandLines(cards, this.mergeHand(options));
  }

  public renderStack(cards: StackCard[], options?: StackRenderOptions): string {
    return renderStack(cards, this.mergeStack(options));
  }

  public renderStackLines(cards: StackCard[], options?: StackRenderOptions): string[] {
    return renderStackLines(cards, this.mergeStack(options));
  }

  public renderUnoCard(card: UnoCard, options?: UnoRenderOptions): string {
    return renderUnoCard(card, this.mergeUno(options));
  }

  public renderUnoCardLines(card: UnoCard, options?: UnoRenderOptions): string[] {
    return renderUnoCardLines(card, this.mergeUno(options));
  }

  public renderUnoHand(cards: UnoCard[], options?: HandRenderOptions & UnoRenderOptions): string {
    return renderUnoHand(cards, this.mergeUnoHand(options));
  }

  public renderUnoHandLines(cards: UnoCard[], options?: HandRenderOptions & UnoRenderOptions): string[] {
    return renderUnoHandLines(cards, this.mergeUnoHand(options));
  }

  public renderUnoStack(cards: UnoStackCard[], options?: StackRenderOptions & UnoRenderOptions): string {
    return renderUnoStack(cards, this.mergeUnoStack(options));
  }

  public renderUnoStackLines(cards: UnoStackCard[], options?: StackRenderOptions & UnoRenderOptions): string[] {
    return renderUnoStackLines(cards, this.mergeUnoStack(options));
  }

  public buildStandardDeck(): Card[] {
    return buildStandardDeck();
  }

  public buildUnoDeck(): UnoCard[] {
    return buildUnoDeck();
  }

  public shuffleCards<T>(items: T[], seed?: number | string): T[] {
    return shuffleCards(items, seed);
  }

  public parseCardString(value: string): Card {
    return parseCardString(value);
  }

  public parseUnoCardString(value: string): UnoCard {
    return parseUnoCardString(value);
  }

  public stripAnsiCodes(value: string): string {
    return stripAnsiCodes(value);
  }

  private mergeRender(options?: RenderOptions): RenderOptions {
    return { ...this.renderDefaults, ...options };
  }

  private mergeHand(options?: HandRenderOptions): HandRenderOptions {
    return { ...this.renderDefaults, ...this.handDefaults, ...options };
  }

  private mergeStack(options?: StackRenderOptions): StackRenderOptions {
    return { ...this.renderDefaults, ...this.stackDefaults, ...options };
  }

  private mergeUno(options?: UnoRenderOptions): UnoRenderOptions {
    return { ...this.renderDefaults, ...this.unoDefaults, ...options };
  }

  private mergeUnoHand(options?: HandRenderOptions & UnoRenderOptions): HandRenderOptions & UnoRenderOptions {
    return { ...this.renderDefaults, ...this.unoDefaults, ...this.handDefaults, ...options };
  }

  private mergeUnoStack(options?: StackRenderOptions & UnoRenderOptions): StackRenderOptions & UnoRenderOptions {
    return { ...this.renderDefaults, ...this.unoDefaults, ...this.stackDefaults, ...options };
  }
}

const MULBERRY32 = (seed: number) => {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const buildUnoDeck = (): UnoCard[] => {
  const colors: UnoColor[] = ["R", "G", "B", "Y"];
  const numbers: UnoValue[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const specials: UnoValue[] = ["skip", "reverse", "draw2"];
  const deck: UnoCard[] = [];

  for (const color of colors) {
    // One zero per color
    deck.push({ color, value: "0" });
    // Two of each 1-9 and specials per color
    for (const val of numbers.slice(1)) {
      deck.push({ color, value: val }, { color, value: val });
    }
    for (const val of specials) {
      deck.push({ color, value: val }, { color, value: val });
    }
  }
  // Four wilds and four wild draw fours
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "W", value: "wild" });
    deck.push({ color: "W", value: "wild4" });
  }
  return deck;
};

export const buildStandardDeck = (): Card[] => {
  const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits: Suit[] = ["\u2660", "\u2665", "\u2666", "\u2663"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }
  return deck;
};

export const shuffleCards = <T>(items: T[], seed?: number | string): T[] => {
  const list = items.slice();
  if (list.length <= 1) return list;
  const rand =
    seed === undefined
      ? Math.random
      : (() => {
          const numSeed =
            typeof seed === "number" ? seed : Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          return MULBERRY32(numSeed || 1);
        })();

  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const DEFAULT_STYLE: CardStyle = "ascii";
const DEFAULT_SIZE: CardSize = "full";
const DEFAULT_FACE: CardFace = "front";
const DEFAULT_BACK_STYLE: BackStyle = "lined";
const DEFAULT_COLOR: ColorMode = "ansi";
const UNO_DEFAULT_COLOR: ColorMode = "ansi";
const UNO_DEFAULT_SIZE: CardSize = "mini";
const INNER_WIDTH = 9;

const UNICODE_TOP = "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510";
const UNICODE_BOTTOM = "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518";
const UNICODE_EMPTY = "\u2502         \u2502";
const UNICODE_BORDER = "\u2502";
const UNICODE_TOP_LEFT = "\u250c";
const UNICODE_TOP_RIGHT = "\u2510";
const UNICODE_BOTTOM_LEFT = "\u2514";
const UNICODE_BOTTOM_RIGHT = "\u2518";

const ASCII_TOP = ".---------.";
const ASCII_BOTTOM = "`---------'";
const ASCII_EMPTY = "|         |";
const ASCII_MINI_TOP = ".---------.";

const ASCII_SUIT_ART: Record<SuitSymbol, string[]> = {
  "\u2660": [".", "/ \\", "(_,_)", "I"],
  "\u2665": ["_ _", "( Y )", "\\ /", "'"],
  "\u2663": ["_", "( )", "(_x_)", "Y"],
  "\u2666": ["/\\", "/  \\", "\\  /", "\\/"],
};

const RANK_SET = new Set<Rank>(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
const SUIT_INPUT_MAP: Record<string, SuitSymbol> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
  "\u2660": "\u2660",
  "\u2665": "\u2665",
  "\u2666": "\u2666",
  "\u2663": "\u2663",
};

const ASCII_BACK_PATTERNS: Record<BackStyle, string[]> = {
  lined: Array(8).fill("|/////////|"),
  dotted: Array(8).fill("|:::::::::|"),
  classic: [
    "|&&&&&&&&&|",
    "|&&&&&&&&&|",
    "|&&&&&&&&&|",
    "|&&&&&&&&&|",
    "|%%%%%%%%%|",
    "|%%%%%%%%%|",
    "|%%%%%%%%%|",
    "|#########|",
  ],
  shiny: [
    "|         |",
    "|       \u00b7 |",
    "|    \u00b7 /  |",
    "|   / / \u00b7 |",
    "|  / / /  |",
    "| \u00b7 / \u00b7   |",
    "|  /      |",
    "|         |",
  ],
};

const UNO_COLOR_LABEL: Record<UnoColor, string> = {
  R: "RED",
  G: "GRN",
  B: "BLU",
  Y: "YLW",
  W: "WILD",
};

const UNO_VALUE_CODE: Record<UnoValue, string> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  skip: "S",
  reverse: "R",
  draw2: "+2",
  wild: "W",
  wild4: "W+4",
};

const UNO_VALUE_ALIASES: Record<string, UnoValue> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  SKIP: "skip",
  S: "skip",
  REVERSE: "reverse",
  REV: "reverse",
  R: "reverse",
  DRAW2: "draw2",
  "+2": "draw2",
  D2: "draw2",
  WILD: "wild",
  W: "wild",
  WILD4: "wild4",
  "W+4": "wild4",
  "+4": "wild4",
};

const UNO_VALUE_DISPLAY: Record<UnoValue, string> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  skip: "SKIP",
  reverse: "REV",
  draw2: "+2",
  wild: "WILD",
  wild4: "W+4",
};

const UNO_SPECIAL_ART: Partial<Record<UnoValue, string[]>> = {
  wild4: [
    "  ___ ___",
    " /B //Y /",
    "/__//__/ ",
    "  ___ ___",
    " /G //R /",
    "/__//__/",
  ],
  wild: [
    "  _____  ",
    " /  |  \\ ",
    "| Y | G |",
    "|---|---|",
    "| B | R |",
    " \\__|__/ ",
  ],
  draw2: [
    "    ____ ",
    "   /   / ",
    "  /   /_ ",
    " /___/ / ",
    "  /   /  ",
    " /___/   ",
  ],
  skip: [
    "  _____  ",
    " /    /\\ ",
    "|    /  |",
    "|   /   |",
    "|  /    |",
    " \\/____/ ",
  ],
  reverse: [
    "      _  ",
    "  _  / \\ ",
    " / \\ \\  \\",
    "/  / /  /",
    "\\  \\ \\_/ ",
    " \\_/     ",
  ],
};

const padStart = (value: string, totalWidth: number) => value.padStart(totalWidth, " ");
const padEnd = (value: string, totalWidth: number) => value.padEnd(totalWidth, " ");
const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

const tokenizeAnsi = (line: string): { tokens: string[]; width: number } => {
  const tokens: string[] = [];
  let active = "";
  let width = 0;
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(line)) !== null) {
    for (let i = lastIndex; i < match.index; i++) {
      tokens[width] = `${active}${line[i]}`;
      width += 1;
    }
    const code = match[0];
    if (code === "\x1b[0m") {
      active = "";
    } else {
      active += code;
    }
    lastIndex = match.index + code.length;
  }

  for (let i = lastIndex; i < line.length; i++) {
    tokens[width] = `${active}${line[i]}`;
    width += 1;
  }

  if (width > 0 && active) {
    tokens[width - 1] = `${tokens[width - 1]}\x1b[0m`;
  }

  return { tokens, width };
};

const BG_WHITE = "\x1b[47m";
const FG_BLACK = "\x1b[30m";
const FG_RED = "\x1b[31m";
const FG_GREEN = "\x1b[32m";
const FG_YELLOW = "\x1b[33m";
const FG_BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

const isRedSuit = (suit: SuitSymbol | SuitAscii) =>
  suit === "\u2665" || suit === "\u2666" || suit === "H" || suit === "D";
const UNO_FG: Record<UnoColor, string> = { R: FG_RED, G: FG_GREEN, B: FG_BLUE, Y: FG_YELLOW, W: FG_BLACK };

const colorChar = (ch: string, fg: string) => `${BG_WHITE}${fg}${ch}${RESET}`;

const colorizeBackLines = (lines: string[]): string[] =>
  lines.map((line) => line.split("").map((ch) => colorChar(ch, FG_RED)).join(""));

const colorizeUnicodeFront = (lines: string[], suit: SuitSymbol, size: CardSize): string[] => {
  const suitIdx = size === "mini" ? 3 : 3;
  const suitIsRed = isRedSuit(suit);
  return lines.map((line, idx) => {
    const chars = line.split("");
    const fgLine = chars.map((ch) => colorChar(ch, FG_BLACK));
    if (idx === suitIdx) {
      const suitPos = line.indexOf(suit);
      if (suitPos !== -1 && suitIsRed) {
        fgLine[suitPos] = colorChar(suit, FG_RED);
      }
    }
    return fgLine.join("");
  });
};

const colorizeAsciiFront = (lines: string[], suit: SuitSymbol): string[] => {
  const suitIsRed = isRedSuit(suit);
  const artStart = 3;
  const artEnd = 6;

  return lines.map((line, idx) => {
    const chars = line.split("");
    const last = chars.length - 1;
    const fgLine = chars.map((ch, i) => {
      if (idx >= artStart && idx <= artEnd && i !== 0 && i !== last && ch !== " ") {
        return colorChar(ch, suitIsRed ? FG_RED : FG_BLACK);
      }
      return colorChar(ch, FG_BLACK);
    });
    return fgLine.join("");
  });
};

const colorizeAsciiMiniFront = (lines: string[], suit: SuitSymbol, rank: Rank): string[] => {
  const suitIsRed = isRedSuit(suit);
  const artLines = ASCII_SUIT_ART[suit];
  const rankPart = rank === "10" ? "10" : ` ${rank}`;
  const separator = artLines[0].length === 1 ? "  " : " ";
  const prefixLen = rankPart.length + separator.length;

  return lines.map((line, idx) => {
    const chars = line.split("");
    const last = chars.length - 1;
    const fgLine = chars.map((ch, i) => {
      if (idx === 1) {
        const inArt = i >= prefixLen && i < prefixLen + artLines[0].length && ch !== " ";
        if (inArt) {
          return colorChar(ch, suitIsRed ? FG_RED : FG_BLACK);
        }
        return colorChar(ch, FG_BLACK);
      }
      if (idx >= 2) {
        if (i !== 0 && i !== last && ch !== " " && suitIsRed) {
          return colorChar(ch, FG_RED);
        }
        return colorChar(ch, FG_BLACK);
      }
      return colorChar(ch, FG_BLACK);
    });
    return fgLine.join("");
  });
};

const colorizeCardLines = (
  lines: string[],
  card: Card,
  options: { style: CardStyle; size: CardSize; face: CardFace; backStyle: BackStyle }
): string[] => {
  const style = options.style;
  const size = options.size;
  const face = options.face;
  const suitSymbol = normalizeSuit(card.suit);

  if (face === "back") {
    return colorizeBackLines(lines);
  }

  if (style === "unicode") {
    return colorizeUnicodeFront(lines, suitSymbol, size);
  }

  if (size === "mini") {
    return colorizeAsciiMiniFront(lines, suitSymbol, card.rank);
  }

  return colorizeAsciiFront(lines, suitSymbol);
};

const colorizeUnoCardLines = (lines: string[], card: UnoCard): string[] => {
  const fg = UNO_FG[card.color];
  const borderChars = new Set([
    "|",
    UNICODE_TOP_LEFT,
    UNICODE_TOP_RIGHT,
    UNICODE_BOTTOM_LEFT,
    UNICODE_BOTTOM_RIGHT,
    "+",
    ".",
    "`",
  ]);

  return lines.map((line) => {
    const chars = line.split("");
    const fgLine = chars.map((ch) => {
      const isBorder = borderChars.has(ch);
      const isSpace = ch === " ";
      if (card.color === "W") {
        if (ch === "R") return colorChar(ch, FG_RED);
        if (ch === "G") return colorChar(ch, FG_GREEN);
        if (ch === "B") return colorChar(ch, FG_BLUE);
        if (ch === "Y") return colorChar(ch, FG_YELLOW);
      }
      const fgCode = isBorder || isSpace ? FG_BLACK : fg;
      return colorChar(ch, fgCode);
    });
    return fgLine.join("");
  });
};

const centerLine = (content: string, width: number): string => {
  const trimmed = content;
  const remaining = width - trimmed.length;
  if (remaining <= 0) return trimmed.slice(0, width);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `${" ".repeat(left)}${trimmed}${" ".repeat(right)}`;
};

const buildSimpleFace = (
  style: CardStyle,
  size: CardSize,
  leftLabel: string,
  rightLabel: string,
  centerContent: string,
  artLines?: string[]
): string[] => {
  const top = style === "unicode" ? UNICODE_TOP : ASCII_TOP;
  const bottom = style === "unicode" ? UNICODE_BOTTOM : ASCII_BOTTOM;
  const border = style === "unicode" ? UNICODE_BORDER : "|";
  const empty = style === "unicode" ? UNICODE_EMPTY : ASCII_EMPTY;

  const leftLine = `${border}${padEnd(leftLabel, INNER_WIDTH)}${border}`;
  const rightLine = `${border}${padStart(rightLabel, INNER_WIDTH)}${border}`;

  const formatArt = (line: string) => `${border}${padEnd(line, INNER_WIDTH)}${border}`;

  if (artLines && artLines.length > 0) {
    const formattedArt = artLines.map(formatArt);
    const lines = [top, leftLine, ...formattedArt, rightLine, bottom];
    if (size === "mini") {
      return [top, leftLine, formattedArt[0] ?? empty, rightLine];
    }
    return lines;
  }

  const center = `${border}${centerLine(centerContent, INNER_WIDTH)}${border}`;
  const lines = [top, leftLine, empty, center, empty, rightLine, bottom];
  return size === "mini" ? lines.slice(0, 4) : lines;
};

const formatRankLeft = (rank: Rank, borderChar: string) => {
  const isTen = rank === "10";
  const rankLeft = isTen ? rank : ` ${rank}`;
  return `${borderChar}${padEnd(rankLeft, INNER_WIDTH)}${borderChar}`;
};

const formatRankRight = (rank: Rank, borderChar: string) => {
  const isTen = rank === "10";
  const rankRight = isTen ? rank : `${rank} `;
  return `${borderChar}${padStart(rankRight, INNER_WIDTH)}${borderChar}`;
};

type CacheKey = string;
const cardCache = new Map<CacheKey, string[]>();
const unoCache = new Map<CacheKey, string[]>();

const cloneLines = (lines: string[]) => lines.slice();

const buildCacheKey = (parts: (string | number | undefined)[]): CacheKey => parts.join("|");

const cacheGet = (map: Map<CacheKey, string[]>, key: CacheKey) => {
  const hit = map.get(key);
  return hit ? cloneLines(hit) : undefined;
};

const cacheSet = (map: Map<CacheKey, string[]>, key: CacheKey, value: string[]) => {
  map.set(key, value);
  return value;
};

const normalizeSuit = (suit: Suit): SuitSymbol => {
  switch (suit) {
    case "S":
      return "\u2660";
    case "H":
      return "\u2665";
    case "D":
      return "\u2666";
    case "C":
      return "\u2663";
    default:
      return suit;
  }
};

const normalizeUnoSize = (requested?: CardSize): CardSize => {
  if (requested === "mini" || requested === "full") {
    return requested;
  }
  return UNO_DEFAULT_SIZE;
};

export const stripAnsiCodes = stripAnsi;

export const parseCardString = (value: string): Card => {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length < 2) {
    throw new Error(`Invalid card value "${value}". Use formats like QS, 10H, AD.`);
  }
  const suitChar = trimmed.slice(-1);
  const rankPart = trimmed.slice(0, -1);
  const suit = SUIT_INPUT_MAP[suitChar];
  if (!suit) {
    throw new Error(`Invalid suit "${suitChar}" in "${value}". Use S/H/D/C or suit symbols.`);
  }
  const rank = rankPart as Rank;
  if (!RANK_SET.has(rank)) {
    throw new Error(`Invalid rank "${rankPart}" in "${value}". Use A,2-10,J,Q,K.`);
  }
  return { rank, suit };
};

export const parseUnoCardString = (value: string): UnoCard => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) throw new Error("UNO card string cannot be empty.");

  // Wilds without explicit color
  if (trimmed === "W" || trimmed === "WILD" || trimmed === "W+4" || trimmed === "+4") {
    const mapped = UNO_VALUE_ALIASES[trimmed];
    return { color: "W", value: mapped };
  }

  const colorChar = trimmed[0];
  const rest = trimmed.slice(1);
  const colorMap: Record<string, UnoColor> = { R: "R", G: "G", B: "B", Y: "Y", W: "W" };
  const color = colorMap[colorChar];
  if (!color) throw new Error(`Invalid UNO color "${colorChar}" in "${value}". Use R/G/B/Y or W for wilds.`);

  const mappedValue = UNO_VALUE_ALIASES[rest] ?? UNO_VALUE_ALIASES[trimmed];
  if (!mappedValue) {
    throw new Error(
      `Invalid UNO value "${rest || trimmed}" in "${value}". Use 0-9, skip, reverse, draw2, wild, wild4/+4.`
    );
  }

  return { color, value: mappedValue };
};

const renderUnicodeCardLines = ({ rank, suit }: Card): string[] => {
  const symbol = normalizeSuit(suit);
  const suitLine = `${UNICODE_BORDER}    ${symbol}    ${UNICODE_BORDER}`;
  const rankLineLeft = formatRankLeft(rank, UNICODE_BORDER);
  const rankLineRight = formatRankRight(rank, UNICODE_BORDER);

  return [
    UNICODE_TOP,
    rankLineLeft,
    UNICODE_EMPTY,
    suitLine,
    UNICODE_EMPTY,
    rankLineRight,
    UNICODE_BOTTOM,
  ];
};

const renderAsciiCardLines = ({ rank, suit }: Card): string[] => {
  const symbol = normalizeSuit(suit);
  const artLines = ASCII_SUIT_ART[symbol].map((line) => `|${centerLine(line, INNER_WIDTH)}|`);

  return [
    ASCII_TOP,
    formatRankLeft(rank, "|"),
    ASCII_EMPTY,
    ...artLines,
    ASCII_EMPTY,
    formatRankRight(rank, "|"),
    ASCII_BOTTOM,
  ];
};

const renderAsciiMiniCardLines = ({ rank, suit }: Card): string[] => {
  const symbol = normalizeSuit(suit);
  const artLines = ASCII_SUIT_ART[symbol];
  const rankPart = rank === "10" ? "10" : ` ${rank}`;
  // Use a wider separator for very short art to keep the suit visibly offset from the rank.
  const separator = artLines[0].length === 1 ? "  " : " ";
  const firstLineInner = padEnd(`${rankPart}${separator}${artLines[0]}`, INNER_WIDTH);
  const firstLine = `|${firstLineInner}|`;
  const remainingArt = artLines.slice(1).map((line) => `|${centerLine(line, INNER_WIDTH)}|`);

  return [ASCII_MINI_TOP, firstLine, ...remainingArt];
};

const renderBackLines = ({
  face,
  style,
  size,
  backStyle,
  customBackLines,
}: {
  face: CardFace;
  style: CardStyle;
  size: CardSize;
  backStyle: BackStyle;
  customBackLines?: string[];
}): string[] => {
  const useUnicode = style === "unicode";
  const top = useUnicode ? UNICODE_TOP : ASCII_TOP;
  const bottom = useUnicode ? UNICODE_BOTTOM : ASCII_BOTTOM;

  if (face === "front") {
    return [];
  }

  const patternSource =
    customBackLines && customBackLines.length > 0
      ? customBackLines
      : ASCII_BACK_PATTERNS[backStyle] ?? ASCII_BACK_PATTERNS.lined;

  const normalizedPattern = patternSource.map((line) => {
    const trimmed = line.trimEnd();
    const hasBorder =
      /^.[^]*.$/.test(trimmed) && (trimmed.startsWith("|") || trimmed.startsWith(UNICODE_BORDER));
    if (hasBorder) {
      const inner = trimmed.slice(1, -1);
      return `${useUnicode ? UNICODE_BORDER : "|"}${padEnd(inner.slice(0, INNER_WIDTH), INNER_WIDTH)}${
        useUnicode ? UNICODE_BORDER : "|"
      }`;
    }
    return `${useUnicode ? UNICODE_BORDER : "|"}${padEnd(trimmed.slice(0, INNER_WIDTH), INNER_WIDTH)}${
      useUnicode ? UNICODE_BORDER : "|"
    }`;
  });

  const miniLines = normalizedPattern.slice(0, 3);
  const fullLines = normalizedPattern.slice(0, 5);

  if (size === "mini") {
    return [top, ...miniLines];
  }
  return [top, ...fullLines, bottom];
};

const renderUnoFaceLines = (card: UnoCard, style: CardStyle, size: CardSize): string[] => {
  const valueCode = UNO_VALUE_CODE[card.value];
  const leftCode = card.color === "W" ? `${valueCode}` : `${card.color}${valueCode}`;
  const rightCode = leftCode;
  const border = style === "unicode" ? UNICODE_BORDER : "|";
  const leftLabel = leftCode.length === 3 ? leftCode : `${leftCode} `;
  const rightLabel = rightCode.length === 3 ? rightCode : `${rightCode} `;

  const valueDisplay = UNO_VALUE_DISPLAY[card.value];
  const centerContent = `UNO ${valueDisplay}`;
  const art = UNO_SPECIAL_ART[card.value];
  return buildSimpleFace(style, size, leftLabel, rightLabel, centerContent, art);
};

/**
 * Builds the ASCII representation of a single card as an array of lines.
 * The output mirrors the layout of the original Python implementation by default.
 * Defaults to ASCII output; pass `{ style: "unicode" }` for Unicode box/suit symbols.
 * Pass `{ size: "mini" }` to show only the upper half of the card.
 * Pass `{ face: "back" }` (optionally with `backStyle`) to render a backside.
 */
export function renderCardLines(card: Card, options?: RenderOptions): string[] {
  const style = options?.style ?? DEFAULT_STYLE;
  const size = options?.size ?? DEFAULT_SIZE;
  const face = options?.face ?? DEFAULT_FACE;
  const backStyle = options?.backStyle ?? DEFAULT_BACK_STYLE;
  const color = options?.color ?? DEFAULT_COLOR;
  const customBackLines = options?.customBackLines;

  const suitSymbol = normalizeSuit(card.suit);
  const cacheKey = buildCacheKey([
    "std",
    card.rank,
    suitSymbol,
    style,
    size,
    face,
    backStyle,
    color,
    customBackLines?.join(","),
  ]);
  const cached = cacheGet(cardCache, cacheKey);
  if (cached) return cached;

  if (face === "back") {
    const lines = renderBackLines({ face, style, size, backStyle, customBackLines });
    const colored = color === "ansi" ? colorizeCardLines(lines, card, { style, size, face, backStyle }) : lines;
    return cacheSet(cardCache, cacheKey, colored);
  }

  if (style === "unicode") {
    const lines = renderUnicodeCardLines(card);
    const sliced = size === "mini" ? lines.slice(0, 4) : lines;
    const colored = color === "ansi" ? colorizeCardLines(sliced, card, { style, size, face, backStyle }) : sliced;
    return cacheSet(cardCache, cacheKey, colored);
  }

  if (size === "mini") {
    const lines = renderAsciiMiniCardLines(card);
    const colored = color === "ansi" ? colorizeCardLines(lines, card, { style, size, face, backStyle }) : lines;
    return cacheSet(cardCache, cacheKey, colored);
  }

  const lines = renderAsciiCardLines(card);
  const colored = color === "ansi" ? colorizeCardLines(lines, card, { style, size, face, backStyle }) : lines;
  return cacheSet(cardCache, cacheKey, colored);
}

export function renderUnoCardLines(card: UnoCard, options?: UnoRenderOptions): string[] {
  const style = options?.style ?? DEFAULT_STYLE;
  const size = normalizeUnoSize(options?.size);
  const face = options?.face ?? DEFAULT_FACE;
  const backStyle = options?.backStyle ?? DEFAULT_BACK_STYLE;
  const color = options?.color ?? UNO_DEFAULT_COLOR;
  const customBackLines = options?.customBackLines;

  const cacheKey = buildCacheKey([
    "uno",
    card.color,
    card.value,
    style,
    size,
    face,
    backStyle,
    color,
    customBackLines?.join(","),
  ]);
  const cached = cacheGet(unoCache, cacheKey);
  if (cached) return cached;

  if (face === "back") {
    const lines = renderBackLines({ face, style, size, backStyle, customBackLines });
    const colored = color === "ansi" ? colorizeBackLines(lines) : lines;
    return cacheSet(unoCache, cacheKey, colored);
  }

  const lines = renderUnoFaceLines(card, style, size);
  const trimmed = size === "mini" ? lines.slice(0, 4) : lines;
  const colored = color === "ansi" ? colorizeUnoCardLines(trimmed, card) : trimmed;
  return cacheSet(unoCache, cacheKey, colored);
}

/**
 * Renders a card as a single string joined by newlines.
 */
export function renderCard(card: Card, options?: RenderOptions): string {
  return renderCardLines(card, options).join("\n");
}

export function renderUnoCard(card: UnoCard, options?: UnoRenderOptions): string {
  return renderUnoCardLines(card, options).join("\n");
}

/**
 * Prints the ASCII card to stdout, one line per console.log.
 */
export function printCard(card: Card, options?: RenderOptions): void {
  renderCardLines(card, options).forEach((line) => console.log(line));
}

export function printUnoCard(card: UnoCard, options?: UnoRenderOptions): void {
  renderUnoCardLines(card, options).forEach((line) => console.log(line));
}

const rtrim = (value: string) => value.replace(/\s+$/, "");

interface PlacedCard {
  x: number;
  y: number;
  lines: string[];
}

const placeCards = (placements: PlacedCard[]): string[] => {
  const minX = Math.min(...placements.map((p) => p.x));
  const shiftX = -minX;
  const tokenized = placements.map(({ lines }) => lines.map((line) => tokenizeAnsi(line)));

  const width = Math.max(...placements.map((p, i) => p.x + shiftX + tokenized[i][0].width));
  const height = Math.max(...placements.map((p, i) => p.y + tokenized[i].length));

  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(" "));

  placements.forEach(({ x, y }, idx) => {
    const targetX = x + shiftX;
    tokenized[idx].forEach(({ tokens }, lineIndex) => {
      const row = y + lineIndex;
      tokens.forEach((token, col) => {
        grid[row][targetX + col] = token;
      });
    });
  });

  return grid.map((row) => rtrim(row.join("")));
};

const buildPlacements = (cards: Card[], options: Required<Pick<HandRenderOptions, "layout">> & HandRenderOptions) => {
  const { layout } = options;
  const cardLines = cards.map((card) => renderCardLines(card, options));
  const width = tokenizeAnsi(cardLines[0][0]).width;
  const defaultStep = layout.includes("condensed") ? Math.max(2, width - 4) : width;
  const step = options.spacing ?? defaultStep;
  const center = Math.floor((cards.length - 1) / 2);

  return cards.map((card, index) => {
    const offset = index - center;
    const x = layout.startsWith("arch") ? offset * step : index * step;
    const y = layout.startsWith("arch") ? Math.abs(offset) : 0;
    return { x, y, lines: cardLines[index] };
  });
};

const buildUnoPlacements = (
  cards: UnoCard[],
  options: Required<Pick<HandRenderOptions, "layout">> & HandRenderOptions & UnoRenderOptions
) => {
  const { layout } = options;
  const cardLines = cards.map((card) => renderUnoCardLines(card, options));
  const width = tokenizeAnsi(cardLines[0][0]).width;
  const defaultStep = layout.includes("condensed") ? Math.max(2, width - 4) : width;
  const step = options.spacing ?? defaultStep;
  const center = Math.floor((cards.length - 1) / 2);

  return cards.map((_, index) => {
    const offset = index - center;
    const x = layout.startsWith("arch") ? offset * step : index * step;
    const y = layout.startsWith("arch") ? Math.abs(offset) : 0;
    return { x, y, lines: cardLines[index] };
  });
};

/**
 * Builds an ASCII representation of a hand of cards.
 * - layout: "flat" (default), "flat-condensed", "arch", "arch-condensed"
 * - style: "unicode" (default) or "ascii"
 * - size: "full" (default) or "mini"
 */
export function renderHandLines(cards: Card[], options?: HandRenderOptions): string[] {
  if (cards.length === 0) return [];

  const layout = options?.layout ?? "flat";
  const placements = buildPlacements(cards, { ...options, layout });

  return placeCards(placements);
}

export function renderHand(cards: Card[], options?: HandRenderOptions): string {
  return renderHandLines(cards, options).join("\n");
}

export function printHand(cards: Card[], options?: HandRenderOptions): void {
  renderHandLines(cards, options).forEach((line) => console.log(line));
}

export function renderUnoHandLines(cards: UnoCard[], options?: HandRenderOptions & UnoRenderOptions): string[] {
  if (cards.length === 0) return [];

  const layout = options?.layout ?? "flat";
  const placements = buildUnoPlacements(cards, { ...options, layout });

  return placeCards(placements);
}

export function renderUnoHand(cards: UnoCard[], options?: HandRenderOptions & UnoRenderOptions): string {
  return renderUnoHandLines(cards, options).join("\n");
}

export function printUnoHand(cards: UnoCard[], options?: HandRenderOptions & UnoRenderOptions): void {
  renderUnoHandLines(cards, options).forEach((line) => console.log(line));
}

/**
 * Renders a vertical stack of cards (e.g., for solitaire piles).
 * Cards are rendered from top to bottom in the order provided; later cards sit lower and overwrite overlapped portions.
 */
export function renderStackLines(cards: StackCard[], options?: StackRenderOptions): string[] {
  if (cards.length === 0) return [];

  const baseStyle = options?.style ?? DEFAULT_STYLE;
  const baseSize = options?.size ?? DEFAULT_SIZE;
  const baseFace = options?.face ?? DEFAULT_FACE;
  const baseBack = options?.backStyle ?? DEFAULT_BACK_STYLE;
  const baseColor = options?.color ?? DEFAULT_COLOR;
  const overlap = options?.overlap ?? (baseSize === "mini" ? 1 : 2);

  const placements: PlacedCard[] = cards.map((card, index) => {
    const style = card.style ?? baseStyle;
    const size = card.size ?? baseSize;
    const face = card.face ?? baseFace;
    const backStyle = card.backStyle ?? baseBack;
    const lines = renderCardLines(card, { style, size, face, backStyle, color: baseColor });
    const y = (cards.length - index - 1) * overlap;
    return { x: 0, y, lines };
  });

  return placeCards(placements);
}

export function renderStack(cards: StackCard[], options?: StackRenderOptions): string {
  return renderStackLines(cards, options).join("\n");
}

export function printStack(cards: StackCard[], options?: StackRenderOptions): void {
  renderStackLines(cards, options).forEach((line) => console.log(line));
}

export function renderUnoStackLines(cards: UnoStackCard[], options?: StackRenderOptions & UnoRenderOptions): string[] {
  if (cards.length === 0) return [];

  const baseStyle = options?.style ?? DEFAULT_STYLE;
  const baseSize = normalizeUnoSize(options?.size);
  const baseFace = options?.face ?? DEFAULT_FACE;
  const baseBack = options?.backStyle ?? DEFAULT_BACK_STYLE;
  const baseColor = options?.color ?? UNO_DEFAULT_COLOR;
  const overlap = options?.overlap ?? (baseSize === "mini" ? 1 : 2);

  const placements: PlacedCard[] = cards.map((card, index) => {
    const style = card.style ?? options?.style ?? baseStyle;
    const size = card.size ?? options?.size ?? baseSize;
    const face = card.face ?? options?.face ?? baseFace;
    const backStyle = card.backStyle ?? options?.backStyle ?? baseBack;
    const lines = renderUnoCardLines(card, { style, size, face, backStyle, color: baseColor });
    const y = (cards.length - index - 1) * overlap;
    return { x: 0, y, lines };
  });

  return placeCards(placements);
}

export function renderUnoStack(cards: UnoStackCard[], options?: StackRenderOptions & UnoRenderOptions): string {
  return renderUnoStackLines(cards, options).join("\n");
}

export function printUnoStack(cards: UnoStackCard[], options?: StackRenderOptions & UnoRenderOptions): void {
  renderUnoStackLines(cards, options).forEach((line) => console.log(line));
}
