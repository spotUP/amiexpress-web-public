/**
 * A PATIENCE IS A TEXT FILE.
 *
 * csol (https://github.com/nielssp/csol, MIT) describes each of its eleven
 * solitaires declaratively rather than in code: a `.game` file says which
 * piles the game has, where they sit, how many cards each is dealt, and what
 * may be played on what. Adopting that format instead of inventing one means
 * every patience after the first costs a text file, and the files csol
 * already ships work unchanged.
 *
 * The format, by example (games/klondike.game):
 *
 *     game {
 *       name klondike
 *       title Klondike
 *       repeat 4 {
 *         foundation { x 3+  first_rank a  next_suit same  next_rank up }
 *       }
 *       repeat 7 {
 *         tableau { y 1  x 0+  deal 1+  hide -1
 *                   first_rank k  next_suit diff_color  next_rank down
 *                   move_group group }
 *       }
 *       stock { deal 52 }
 *       waste { x 1  from stock }
 *     }
 *
 * `repeat N { ... }` lays the block down N times, and a value written `3+`
 * counts up once per repetition - so `x 0+` over seven tableaus is columns
 * zero to six, and `deal 1+` is the one-two-three staircase Klondike deals.
 *
 * This module is the READER only. What the rules mean is `engine.ts`.
 */

export type PileType = 'foundation' | 'tableau' | 'stock' | 'waste' | 'cell';

/** Rank rules, as csol spells them. */
export type RankRule =
  | 'any' | 'none' | 'empty' | 'same' | 'down' | 'up' | 'up_down' | 'lower' | 'higher'
  | 'a' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'j' | 'q' | 'k' | 'king';

/** Suit rules, likewise. */
export type SuitRule =
  | 'any' | 'none' | 'same' | 'same_color' | 'diff' | 'diff_color'
  | 's' | 'h' | 'd' | 'c' | 'red' | 'black';

export type MoveGroup = 'one' | 'group' | 'all' | 'any';

/** The rules a pile applies to a card arriving on it. */
export interface PileRules {
  firstRank?: RankRule;
  nextRank?: RankRule;
  nextSuit?: SuitRule;
  moveGroup?: MoveGroup;
  /** Pile types a card may arrive FROM; empty means anywhere. */
  from?: PileType[];
  /** Where a stock's cards go when it is turned. */
  to?: PileType[];
  winRank?: RankRule;
  /** Rules that REPLACE these when source and destination share a class. */
  sameClass?: PileRules;
  /** Rules a moved SEQUENCE must satisfy within itself. */
  validGroup?: PileRules;
}

export interface PileDefinition extends PileRules {
  type: PileType;
  /** Column and row, in csol's own grid. */
  x: number;
  y: number;
  /** Cards dealt at the start; `rest` takes everything left. */
  deal: number | 'rest';
  /**
   * Face-down cards. A negative number hides all BUT that many from the top,
   * which is how Klondike says "only the last card is face up" (`hide -1`).
   */
  hide: number;
  /** Cards a stock turns at once. */
  turn?: number;
  /** -1 for unlimited. */
  redeal?: number;
  /** Piles of the same class share the `same_class` rules. */
  class?: number;
  /** Position among the piles of this type, left to right. */
  index: number;
}

export interface GameDefinition {
  name: string;
  title: string;
  decks: number;
  /** e.g. "s" for a one-suit Spider; absent means all four. */
  deckSuits?: string;
  piles: PileDefinition[];
}

// ============================================================================
// Tokens
// ============================================================================

type Token = { value: string };

/**
 * Words and braces. Everything in this format is whitespace-separated, and a
 * `#` starts a comment to end of line.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    for (const word of line.split(/\s+/)) {
      if (word === '') continue;
      // Braces bind to the word beside them in some files.
      const parts = word.match(/[{}]|[^{}]+/g) ?? [];
      for (const part of parts) tokens.push({ value: part });
    }
  }
  return tokens;
}

class Reader {
  private at = 0;
  constructor(private readonly tokens: Token[]) {}

  public peek(): string | null {
    return this.tokens[this.at]?.value ?? null;
  }

  public next(): string {
    const token = this.tokens[this.at];
    if (!token) throw new Error('Unexpected end of game definition');
    this.at += 1;
    return token.value;
  }

  public expect(value: string): void {
    const found = this.next();
    if (found !== value) throw new Error(`Expected "${value}" but found "${found}"`);
  }

  public done(): boolean {
    return this.at >= this.tokens.length;
  }
}

// ============================================================================
// Values
// ============================================================================

/**
 * A number, and whether it counts up per repetition.
 *
 * `3+` means "three, then four, then five..." - csol's way of laying seven
 * tableaus across seven columns without writing seven blocks.
 */
interface CountingValue {
  base: number;
  counts: boolean;
}

function parseCounting(value: string): CountingValue {
  const counts = value.endsWith('+');
  const base = parseInt(counts ? value.slice(0, -1) : value, 10);
  if (Number.isNaN(base)) throw new Error(`Expected a number, found "${value}"`);
  return { base, counts };
}

const PILE_TYPES: PileType[] = ['foundation', 'tableau', 'stock', 'waste', 'cell'];

const isPileType = (value: string): value is PileType =>
  (PILE_TYPES as string[]).includes(value);

// ============================================================================
// Blocks
// ============================================================================

/** One pile block, before `repeat` has multiplied it. */
interface PileTemplate {
  type: PileType;
  x: CountingValue;
  y: CountingValue;
  deal: CountingValue | 'rest';
  hide: number;
  turn?: number;
  redeal?: number;
  class?: number;
  rules: PileRules;
}

function parseRuleKey(key: string, reader: Reader, rules: PileRules): boolean {
  switch (key) {
    case 'first_rank': rules.firstRank = reader.next() as RankRule; return true;
    case 'next_rank': rules.nextRank = reader.next() as RankRule; return true;
    case 'next_suit': rules.nextSuit = reader.next() as SuitRule; return true;
    case 'win_rank': rules.winRank = reader.next() as RankRule; return true;
    case 'move_group': rules.moveGroup = reader.next() as MoveGroup; return true;
    case 'from': {
      const value = reader.next();
      if (isPileType(value)) rules.from = [...(rules.from ?? []), value];
      return true;
    }
    case 'to': {
      const value = reader.next();
      if (isPileType(value)) rules.to = [...(rules.to ?? []), value];
      return true;
    }
    case 'same_class':
      rules.sameClass = parseRuleBlock(reader);
      return true;
    case 'valid_group':
      rules.validGroup = parseRuleBlock(reader);
      return true;
    default:
      return false;
  }
}

/** `{ ... }` holding nothing but rules. */
function parseRuleBlock(reader: Reader): PileRules {
  reader.expect('{');
  const rules: PileRules = {};
  while (reader.peek() !== '}') {
    const key = reader.next();
    if (!parseRuleKey(key, reader, rules)) {
      // Unknown key inside a rule block: skip its value rather than fail, so
      // a file written for a newer csol still loads the parts we understand.
      if (reader.peek() === '{') parseRuleBlock(reader);
      else reader.next();
    }
  }
  reader.expect('}');
  return rules;
}

function parsePile(type: PileType, reader: Reader): PileTemplate {
  reader.expect('{');
  const template: PileTemplate = {
    type,
    x: { base: 0, counts: false },
    y: { base: 0, counts: false },
    deal: { base: 0, counts: false },
    hide: 0,
    rules: {},
  };

  while (reader.peek() !== '}') {
    const key = reader.next();
    if (parseRuleKey(key, reader, template.rules)) continue;

    switch (key) {
      case 'x': template.x = parseCounting(reader.next()); break;
      case 'y': template.y = parseCounting(reader.next()); break;
      case 'deal': {
        const value = reader.next();
        template.deal = value === 'rest' ? 'rest' : parseCounting(value);
        break;
      }
      case 'hide': template.hide = parseInt(reader.next(), 10) || 0; break;
      case 'turn': template.turn = parseInt(reader.next(), 10) || 0; break;
      case 'redeal': template.redeal = parseInt(reader.next(), 10); break;
      case 'class': template.class = parseInt(reader.next(), 10); break;
      default:
        if (reader.peek() === '{') parseRuleBlock(reader);
        else reader.next();
        break;
    }
  }

  reader.expect('}');
  return template;
}

/** Lay a template down, with its counting values advanced by `step`. */
function instantiate(template: PileTemplate, step: number, index: number): PileDefinition {
  return {
    type: template.type,
    x: template.x.base + (template.x.counts ? step : 0),
    y: template.y.base + (template.y.counts ? step : 0),
    deal: template.deal === 'rest'
      ? 'rest'
      : template.deal.base + (template.deal.counts ? step : 0),
    hide: template.hide,
    turn: template.turn,
    redeal: template.redeal,
    class: template.class,
    index,
    ...template.rules,
  };
}

// ============================================================================
// The game
// ============================================================================

export function parseGameDefinition(source: string): GameDefinition {
  const reader = new Reader(tokenize(source));
  reader.expect('game');
  reader.expect('{');

  const game: GameDefinition = { name: '', title: '', decks: 1, piles: [] };
  const counters: Partial<Record<PileType, number>> = {};

  const addPile = (template: PileTemplate, step: number): void => {
    const index = counters[template.type] ?? 0;
    counters[template.type] = index + 1;
    game.piles.push(instantiate(template, step, index));
  };

  while (reader.peek() !== '}') {
    const key = reader.next();

    if (key === 'name') { game.name = reader.next(); continue; }
    if (key === 'title') {
      // A title runs to the end of its line, and the tokenizer has already
      // split it, so take words until the next key-shaped token.
      const words: string[] = [reader.next()];
      while (reader.peek() && !/^(repeat|name|decks|deck_suits|\}|foundation|tableau|stock|waste|cell)$/.test(reader.peek() as string)) {
        words.push(reader.next());
      }
      game.title = words.join(' ');
      continue;
    }
    if (key === 'decks') { game.decks = parseInt(reader.next(), 10) || 1; continue; }
    if (key === 'deck_suits') { game.deckSuits = reader.next(); continue; }

    if (key === 'repeat') {
      const times = parseInt(reader.next(), 10) || 0;
      reader.expect('{');
      const type = reader.next();
      if (!isPileType(type)) throw new Error(`Unknown pile type "${type}"`);
      const template = parsePile(type, reader);
      reader.expect('}');
      for (let step = 0; step < times; step += 1) addPile(template, step);
      continue;
    }

    if (isPileType(key)) {
      addPile(parsePile(key, reader), 0);
      continue;
    }

    /*
     * A word followed by `{` at the top level IS a pile declaration, and one
     * we do not know is a pile the game would silently lose - a typo that
     * deals a different game. That is refused. An unknown SCALAR key is only
     * a setting from a newer csol, and is skipped so the rest still loads.
     */
    if (reader.peek() === '{') {
      throw new Error(`Unknown pile type "${key}"`);
    }
    reader.next();
  }

  reader.expect('}');
  if (!game.name) throw new Error('A game definition needs a name');
  if (!game.title) game.title = game.name;
  return game;
}
