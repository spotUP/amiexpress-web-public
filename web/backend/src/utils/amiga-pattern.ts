/**
 * AmigaDOS wildcard patterns - the one matcher for dos.library's
 * ParsePattern/MatchPattern, LhA's member arguments and rexxarplib's
 * MATCHPATTERN/FILELIST.
 *
 * Grammar (dos.library ParsePattern autodoc, V37):
 *   ?        any one character
 *   #<item>  zero or more of <item>        (#? = any run)
 *   *        any run - the V39 WILDSTAR spelling, which LhA and most tools accept
 *   (a|b)    either alternative            ( ) alone just groups
 *   ~<item>  any string <item> does not match
 *   [abc]    one character of the set; a-z ranges; [~abc] negates
 *   %        the empty string
 *   '        the next character literally
 *
 * The pattern is parsed into a small tree and matched by the set of end
 * positions each item can reach, so `~` and alternatives in the middle of a
 * pattern hold for the rest of it (the tokenised matcher this replaces
 * dropped whatever followed an OR group and let `~` eat one character).
 */

type Item =
  | { kind: 'char'; code: string }
  | { kind: 'one' }
  | { kind: 'empty' }
  | { kind: 'class'; negate: boolean; ranges: Array<[string, string]> }
  | { kind: 'alt'; alternatives: Item[][] }
  | { kind: 'repeat'; item: Item }
  | { kind: 'not'; item: Item };

export interface AmigaPattern {
  /** False when the pattern is a plain name - ParsePattern's D0 = 0. */
  readonly wild: boolean;
  /** True when the whole of `text` matches. */
  matches(text: string): boolean;
}

class Parser {
  private at = 0;
  wild = false;

  constructor(private readonly source: string) {}

  parse(): Item[] {
    const sequence = this.sequence();
    // A stray ')' or '|' at the top level is a plain character to AmigaDOS.
    while (this.at < this.source.length) {
      sequence.push({ kind: 'char', code: this.source[this.at++] });
      sequence.push(...this.sequence());
    }
    return sequence;
  }

  private sequence(): Item[] {
    const items: Item[] = [];
    while (this.at < this.source.length) {
      const ch = this.source[this.at];
      if (ch === '|' || ch === ')') break;
      const item = this.item();
      if (item) items.push(item);
    }
    return items;
  }

  private item(): Item | null {
    if (this.at >= this.source.length) return null;
    const ch = this.source[this.at++];
    switch (ch) {
      case '?':
        this.wild = true;
        return { kind: 'one' };
      case '*':
        this.wild = true;
        return { kind: 'repeat', item: { kind: 'one' } };
      case '%':
        this.wild = true;
        return { kind: 'empty' };
      case '#': {
        this.wild = true;
        const item = this.item();
        return item ? { kind: 'repeat', item } : { kind: 'char', code: '#' };
      }
      case '~': {
        this.wild = true;
        const item = this.item();
        return item ? { kind: 'not', item } : { kind: 'char', code: '~' };
      }
      case '(': {
        this.wild = true;
        const alternatives = [this.sequence()];
        while (this.source[this.at] === '|') {
          this.at++;
          alternatives.push(this.sequence());
        }
        if (this.source[this.at] === ')') this.at++;
        return { kind: 'alt', alternatives };
      }
      case '[':
        this.wild = true;
        return this.characterClass();
      case "'":
        if (this.at < this.source.length) return { kind: 'char', code: this.source[this.at++] };
        return { kind: 'char', code: "'" };
      default:
        return { kind: 'char', code: ch };
    }
  }

  private characterClass(): Item {
    let negate = false;
    if (this.source[this.at] === '~') {
      negate = true;
      this.at++;
    }
    const ranges: Array<[string, string]> = [];
    while (this.at < this.source.length && this.source[this.at] !== ']') {
      let low = this.source[this.at++];
      if (low === "'" && this.at < this.source.length) low = this.source[this.at++];
      if (this.source[this.at] === '-' && this.at + 1 < this.source.length && this.source[this.at + 1] !== ']') {
        this.at++;
        let high = this.source[this.at++];
        if (high === "'" && this.at < this.source.length) high = this.source[this.at++];
        ranges.push([low, high]);
      } else {
        ranges.push([low, low]);
      }
    }
    if (this.source[this.at] === ']') this.at++;
    return { kind: 'class', negate, ranges };
  }
}

function sequenceEnds(items: Item[], text: string, from: Set<number>): Set<number> {
  let positions = from;
  for (const item of items) {
    if (positions.size === 0) break;
    const next = new Set<number>();
    for (const at of positions) for (const end of itemEnds(item, text, at)) next.add(end);
    positions = next;
  }
  return positions;
}

function itemEnds(item: Item, text: string, at: number): Set<number> {
  switch (item.kind) {
    case 'char':
      return text[at] === item.code ? new Set([at + 1]) : new Set();
    case 'one':
      return at < text.length ? new Set([at + 1]) : new Set();
    case 'empty':
      return new Set([at]);
    case 'class': {
      if (at >= text.length) return new Set();
      const ch = text[at];
      const inside = item.ranges.some(([low, high]) => ch >= low && ch <= high);
      return inside !== item.negate ? new Set([at + 1]) : new Set();
    }
    case 'alt': {
      const ends = new Set<number>();
      for (const alternative of item.alternatives) {
        for (const end of sequenceEnds(alternative, text, new Set([at]))) ends.add(end);
      }
      return ends;
    }
    case 'repeat': {
      const ends = new Set<number>([at]);
      let frontier = [at];
      while (frontier.length > 0) {
        const next: number[] = [];
        for (const position of frontier) {
          for (const end of itemEnds(item.item, text, position)) {
            if (!ends.has(end)) {
              ends.add(end);
              next.push(end);
            }
          }
        }
        frontier = next;
      }
      return ends;
    }
    case 'not': {
      const matched = itemEnds(item.item, text, at);
      const ends = new Set<number>();
      for (let end = at; end <= text.length; end++) if (!matched.has(end)) ends.add(end);
      return ends;
    }
  }
}

/**
 * Parse an AmigaDOS pattern. `noCase` compares without regard to case, as
 * ParsePatternNoCase / MatchPatternNoCase and every file name on AmigaDOS do.
 */
export function parseAmigaPattern(pattern: string, noCase = false): AmigaPattern {
  const fold = (s: string) => (noCase ? s.toUpperCase() : s);
  const parser = new Parser(fold(pattern));
  const items = parser.parse();
  return {
    wild: parser.wild,
    matches: (text: string) => {
      const folded = fold(text);
      return sequenceEnds(items, folded, new Set([0])).has(folded.length);
    },
  };
}

/** One-shot match: `pattern` against the whole of `text`. */
export function matchAmigaPattern(pattern: string, text: string, noCase = false): boolean {
  return parseAmigaPattern(pattern, noCase).matches(text);
}
