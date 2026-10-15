/**
 * SCROLLTEXT - a line of text read through a window narrower than itself.
 *
 * "in places like this when its hard to fit the text it could use a
 * scrolltext", then "add scrolltext support at sdk level" (sysop,
 * 2026-09-16), after the card lobby's status bar cut a notice mid-sentence:
 * "Showing the cards in front of you. V shows ." - the clip is
 * `StatusBar._fit`, which drops the tail and marks it with a full stop.
 *
 * Clipping is the right answer when a couple of characters are missing and
 * the wrong one when half the sentence is. A board that has lived on 80
 * columns for thirty years, and now answers 40-column C64 callers as well,
 * runs out of row constantly - so the window moves instead, the way a
 * marquee does, and the whole sentence arrives a piece at a time.
 *
 * THIS MODULE IS PURE. No widget, no timer, no screen: a frame is a function
 * of a step number, so the behaviour can be driven and asserted directly and
 * a widget only has to decide when to ask for the next one. The widget half
 * is `StatusBar`'s `scroll` option, and any other single-row widget can use
 * the same controller.
 *
 * Two things it is careful about:
 *
 *   BLESSED TAGS ARE NOT CHARACTERS. `{cyan-fg}` costs no cells, so the
 *   window is measured and cut on the VISIBLE text and the markup is carried
 *   through - including the tags that were already open where the window
 *   starts, which are re-opened in front of it. Cutting the raw string
 *   instead is how a scroll ends up printing a literal "{cyan-fg".
 *
 *   A WINDOW THAT DOES NOT MOVE IS NOT A SCROLL. When the text fits,
 *   `overflows` is false and every frame is the same text - so a caller can
 *   ask unconditionally and start a timer only when there is something to
 *   animate.
 */

/** How the window travels once it reaches the end of the text. */
export type ScrollMode = 'loop' | 'bounce';

export interface ScrollTextOptions {
  /** The full line, blessed tags and all. */
  text: string;
  /** Visible columns the window has. */
  width: number;
  /**
   * What separates the end of the text from its restart in `loop`. Without
   * it the last word runs straight into the first and reads as one word.
   */
  gap?: string;
  /** `loop` carries on in one direction; `bounce` walks back. */
  mode?: ScrollMode;
}

export interface ScrollText {
  /** False when the text fits: every frame is the same, so do not animate. */
  readonly overflows: boolean;
  /** Frames before the animation repeats. 1 when it does not overflow. */
  readonly steps: number;
  /** The visible width of the text itself, tags not counted. */
  readonly textWidth: number;
  /** The window at this step. Any integer; it wraps. */
  frame(step: number): string;
}

/** One piece of a parsed line: a blessed tag, or one visible character. */
type Token = { tag: string } | { ch: string };

const TAG = /^\{[^}]*\}/;

/**
 * Split a line into tags and visible characters.
 *
 * Deliberately the same notion of a tag as the rest of the engine: an
 * unmatched `{` is not a tag and travels as an ordinary character, which is
 * what lets a door print `{` at all.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let rest = text;
  while (rest.length > 0) {
    const tag = TAG.exec(rest);
    if (tag) {
      tokens.push({ tag: tag[0] });
      rest = rest.slice(tag[0].length);
      continue;
    }
    tokens.push({ ch: rest[0] });
    rest = rest.slice(1);
  }
  return tokens;
}

/** The tags still open after this one, as blessed nests them. */
function applyTag(open: string[], tag: string): string[] {
  // `{/}` closes everything; `{/red-fg}` closes the nearest matching open.
  if (tag === '{/}') return [];
  if (tag.startsWith('{/')) {
    const name = tag.slice(2, -1);
    const at = open.map((t) => t.slice(1, -1)).lastIndexOf(name);
    if (at === -1) return open.slice(0, -1);
    return [...open.slice(0, at), ...open.slice(at + 1)];
  }
  return [...open, tag];
}

/** Visible columns in a line, tags not counted. */
export function visibleLength(text: string): number {
  return tokenize(text).filter((t): t is { ch: string } => 'ch' in t).length;
}

/**
 * A window onto `text`, `width` visible columns wide, that can be stepped.
 *
 * `loop` scrolls text+gap round for ever; `bounce` walks to the end and back,
 * which reads better for a short overflow because the start of the sentence
 * is never more than one pass away.
 */
export function createScrollText(options: ScrollTextOptions): ScrollText {
  const { text, mode = 'loop' } = options;
  const width = Math.max(0, Math.floor(options.width));
  const gap = options.gap ?? '   ';

  const tokens = tokenize(text);
  const textWidth = tokens.filter((t): t is { ch: string } => 'ch' in t).length;
  const overflows = width > 0 && textWidth > width;

  if (!overflows) {
    return {
      overflows: false,
      steps: 1,
      textWidth,
      frame: () => text,
    };
  }

  // What actually travels past the window. `loop` reads the text, the gap,
  // and then the text again, so the strip is text+gap repeated.
  const strip = mode === 'loop' ? tokenize(text + gap) : tokens;
  const stripWidth = strip.filter((t): t is { ch: string } => 'ch' in t).length;

  // A bounce is a there-and-back walk: as many steps out as there is text
  // hidden, then the same number home.
  const travel = Math.max(1, stripWidth - width);
  const steps = mode === 'loop' ? stripWidth : travel * 2;

  const startFor = (step: number): number => {
    const at = ((step % steps) + steps) % steps;
    if (mode === 'loop') return at;
    return at <= travel ? at : travel - (at - travel);
  };

  const frame = (step: number): string => {
    const start = startFor(step);
    const wrap = mode === 'loop';

    // Walk to the window, carrying the tag state, then emit `width` columns.
    const open: string[] = [];
    let seen = 0;
    let out = '';
    let emitted = 0;
    let openAtStart: string[] = [];

    // Two passes over the strip at most: the second only for a loop whose
    // window runs off the end and continues at the beginning.
    const passes = wrap ? 2 : 1;
    for (let pass = 0; pass < passes && emitted < width; pass += 1) {
      for (const token of strip) {
        if ('tag' in token) {
          const next = applyTag(open, token.tag);
          open.length = 0;
          open.push(...next);
          // Inside the window the tag travels with the text.
          if (emitted > 0 || seen >= start) {
            if (emitted > 0) out += token.tag;
          }
          continue;
        }
        if (pass === 0 && seen < start) {
          seen += 1;
          continue;
        }
        if (emitted === 0) openAtStart = [...open];
        out += token.ch;
        emitted += 1;
        if (emitted >= width) break;
      }
      // A second pass restarts at the beginning of the strip.
      seen = start;
    }

    return openAtStart.join('') + out + (openAtStart.length > 0 ? '{/}' : '');
  };

  return { overflows: true, steps, textWidth, frame };
}
