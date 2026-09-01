/**
 * Running the glitches against a real blessed element.
 *
 * glitch.ts decides WHETHER and WHAT; this puts it on screen and takes it
 * off again. The split is deliberate: the deciding is arithmetic and is
 * tested, and what is left here is a timer and two setContent calls, which
 * is as little untested code as this can be.
 *
 * The contract that keeps a glitch from becoming a bug report: the element's
 * true content is captured BEFORE the lie is drawn and written back
 * afterwards, from the same closure. There is no path where the damaged
 * text can outlive its timer - not an early return, not a door that exits
 * mid-glitch, because stop() restores as well.
 */
import {
  planGlitch,
  damageRow,
  glitchIsWelcome,
  newGlitchState,
  isColourOnly,
  type GlitchState,
  type Random,
} from './glitch';
import type { Theme } from './tokens';

/** The little blessed needs to be for this to work. */
export interface GlitchTarget {
  getContent(): string;
  setContent(text: string): void;
}

/**
 * A target that works for the element it was handed.
 *
 * A LIST rebuilds its content from `items` on every render, so writing to
 * setContent() is discarded the moment anything repaints - which is why
 * the first attempt glitched nothing visible at all. For a list the rows
 * ARE the items, so that is what gets damaged and restored.
 *
 * Anything else is content-shaped and is used directly.
 */
export function glitchTargetFor(element: any): GlitchTarget {
  const isList = typeof element?.setItems === 'function' && Array.isArray(element?.items);
  if (!isList) return element as GlitchTarget;

  return {
    getContent: () =>
      (element.items as any[])
        .map((item: any) => (typeof item === 'string' ? item : item?.getContent?.() ?? ''))
        .join('\n'),
    setContent: (text: string) => element.setItems(text.split('\n')),
  };
}

export interface GlitchOptions {
  /** How often to consider glitching. The dice are rolled here, not per frame. */
  tickMs?: number;
  /** Asked at every tick - a door that knows the user is typing says so. */
  isBusy?: () => boolean;
  /** Test seam. Defaults to Math.random. */
  random?: Random;
  /** Test seam. Defaults to Date.now. */
  now?: () => number;
}

/**
 * One row of `lines`, damaged according to `plan`.
 *
 * Pure, and returns a NEW array - the caller keeps the original to restore
 * from. A row that would change width is returned untouched: a glitch that
 * lengthened a line would push a border out of true and the repaint would
 * not put it back.
 */
export function glitchLines(
  lines: readonly string[],
  plan: { row: number; kind: Parameters<typeof damageRow>[1] },
  theme: Theme,
  random: Random
): string[] {
  const out = [...lines];
  if (plan.row < 0 || plan.row >= out.length) return out;

  const original = out[plan.row];

  if (isColourOnly(plan.kind)) {
    // These change no characters at all - the damage is entirely in the
    // colour, and the text comes back whole because it never left.
    const text = stripTags(original);
    if (plan.kind === 'invert') {
      // Ground on ink: the row reads as a hole punched in the screen.
      out[plan.row] =
        `{${theme.tokens.ink}-bg}{${theme.tokens.ground}-fg}${text}` +
        `{/${theme.tokens.ground}-fg}{/${theme.tokens.ink}-bg}`;
    } else if (plan.kind === 'fade') {
      // The row drops to chrome, as if that line lost signal.
      out[plan.row] = `{${theme.tokens.chrome}-fg}${text}{/${theme.tokens.chrome}-fg}`;
    } else {
      // A tear: the theme's alert hue.
      out[plan.row] = `{${theme.tokens.alert}-fg}${text}{/${theme.tokens.alert}-fg}`;
    }
    return out;
  }

  const damaged = damageRow(stripTags(original), plan.kind, random);
  out[plan.row] = damaged.length === stripTags(original).length ? damaged : original;
  return out;
}

/** blessed tags would be counted as characters; the damage works on text. */
function stripTags(line: string): string {
  return line.replace(/\{[^}]*\}/g, '');
}

/**
 * Start glitching `target`, and return the function that stops it.
 *
 * Does nothing at all - no timer, no work - when the theme has not asked
 * for glitches. A board on `classic` pays nothing for this existing.
 */
export function attachGlitches(
  target: GlitchTarget,
  theme: Theme,
  render: () => void,
  options: GlitchOptions = {}
): () => void {
  if (!theme.glitches) return () => { /* nothing was started */ };

  // A list has to be damaged through its items; everything else through
  // its content. See glitchTargetFor.
  target = glitchTargetFor(target);

  const tickMs = options.tickMs ?? 4_000;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const state: GlitchState = newGlitchState();

  let repairTimer: ReturnType<typeof setTimeout> | null = null;
  let truth: string | null = null;

  const repair = () => {
    if (truth !== null) {
      target.setContent(truth);
      truth = null;
      render();
    }
    if (repairTimer) {
      clearTimeout(repairTimer);
      repairTimer = null;
    }
  };

  const tick = setInterval(() => {
    // Never while a glitch is already on screen: two lies at once is how
    // one of them ends up permanent.
    if (truth !== null) return;

    if (!glitchIsWelcome({
      themeAllows: theme.glitches,
      userEnabled: true,
      isTyping: options.isBusy ? options.isBusy() : false,
      isSecret: false,
      isTransferring: false,
    })) return;

    const content = target.getContent();
    const lines = content.split('\n');
    const plan = planGlitch(now(), state, lines.length, random);
    if (!plan) return;

    truth = content;
    target.setContent(glitchLines(lines, plan, theme, random).join('\n'));
    render();

    repairTimer = setTimeout(repair, plan.durationMs);
  }, tickMs);

  return () => {
    clearInterval(tick);
    // Restores as well as stops: a door that exits mid-glitch must not
    // leave the damaged row as the last thing anyone saw.
    repair();
  };
}
