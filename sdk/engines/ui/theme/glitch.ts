/**
 * Glitches: the board looking briefly unwell, on purpose.
 *
 * A theme may switch these on. They exist to make the BBS feel like a
 * cyberpunk machine rather than a clean one, and everything here is built
 * around three rules that keep that from becoming a bug report:
 *
 * 1. **One row.** A glitch never touches more than a single row. That is not
 *    taste, it is arithmetic: a 68K door pays ~45ms of emulation per 198-byte
 *    message and a full-screen effect is ~13KB a second. One row is one
 *    message. (TypeScript doors, which is where these actually run, are far
 *    cheaper - but the same ceiling keeps the effect from ever being the
 *    reason a screen feels slow.)
 * 2. **Self-repairing.** A glitch is a LIE told for one frame. The caller
 *    always repaints the true row afterwards, so nothing on screen can be
 *    left wrong. Nothing here mutates the text it was given.
 * 3. **Never while it matters.** Not while someone is typing, not in a
 *    password field, not during a transfer. `glitchIsWelcome` is the single
 *    place that judgement lives.
 *
 * The decisions are pure functions over an injected random source so the
 * scheduling and the damage can both be tested rather than watched.
 */

/** Returns a float in [0, 1). `Math.random` in production, fixed in tests. */
export type Random = () => number;

/** What a single glitch does to one row. */
export type GlitchKind =
  | 'scramble'   // a few characters replaced with block noise
  | 'shift'      // the row slides sideways, wrapping to keep its width
  | 'dropout'    // a run of characters goes missing
  | 'tear'       // the row is recoloured, text untouched
  | 'blocks'     // a run becomes solid block glyphs
  | 'caseflip'   // letters flip case, as if the signal degraded
  | 'invert'     // the row is drawn inverted, text untouched
  | 'fade';      // the row dims to the chrome colour, text untouched

export interface GlitchPlan {
  kind: GlitchKind;
  /** Row to damage, as an index into whatever the caller offered. */
  row: number;
  /** How long the lie stays on screen. */
  durationMs: number;
}

/** What the scheduler needs to remember between ticks. */
export interface GlitchState {
  /** When the last glitch fired, in ms. 0 for "never". */
  lastAt: number;
  /**
   * How long to wait before the next one may fire, DRAWN each time rather
   * than fixed. A constant gap plus a high chance produces a metronome -
   * reported as "the glitches seem to fire at regular intervals". 0 means
   * "not drawn yet".
   */
  nextGapMs: number;
  /** How many have fired in the current minute, for the ceiling below. */
  firedThisMinute: number;
  /** When that minute started. */
  minuteStartedAt: number;
}

export function newGlitchState(): GlitchState {
  return { lastAt: 0, nextGapMs: 0, firedThisMinute: 0, minuteStartedAt: 0 };
}

/**
 * Never closer together than this.
 *
 * Tuned twice by the sysop and both times upwards: twenty seconds was too
 * sparse to notice, six was still too calm ("the glitch frequency must be
 * much higher"). At 1.2 seconds the board reads as a machine that is
 * visibly struggling, which is the point of the whole feature.
 *
 * The gap still exists, and so does the ceiling below it. What they protect
 * is not taste but trust: two glitches at once, or a row that never settles,
 * stops reading as atmosphere and starts reading as a door that is broken.
 * Every glitch is still one row, still self-repairing, and still never
 * while somebody is typing.
 */
export const MIN_GAP_MS = 250;

/**
 * How far beyond the floor a drawn gap can reach.
 *
 * The gap is MIN_GAP + spread * random^2. Squaring biases the draw towards
 * SHORT gaps with an occasional long one, which is what irregular looks
 * like - a uniform draw still reads as evenly spaced, just at a different
 * tempo.
 */
export const GAP_SPREAD_MS = 5_000;

/**
 * Chance that the next gap is a burst - one glitch treading on the heels of
 * the last. Real faults arrive in clusters, and clusters are most of what
 * makes this read as a machine in trouble rather than a timer.
 */
export const BURST_CHANCE = 0.3;

/** The gap inside a burst. Long enough that the two do not overlap. */
export const BURST_GAP_MS = 220;

/** Draw the wait before the next glitch may fire. */
export function drawGap(random: Random): number {
  if (random() < BURST_CHANCE) return BURST_GAP_MS;
  const r = random();
  return MIN_GAP_MS + Math.floor(GAP_SPREAD_MS * r * r);
}

/** And no more than this many in any minute, however the dice fall. */
export const MAX_PER_MINUTE = 40;

/** Chance of firing on a tick that is otherwise eligible. */
export const CHANCE = 0.7;

/**
 * Whether a glitch is acceptable AT ALL right now.
 *
 * Separate from the dice on purpose: this is the judgement about the user's
 * situation, and it is the part that must never be probabilistic. A glitch
 * during a password entry is not charming.
 */
export function glitchIsWelcome(context: {
  themeAllows: boolean;
  userEnabled: boolean;
  isTyping: boolean;
  isSecret: boolean;
  isTransferring: boolean;
}): boolean {
  if (!context.themeAllows || !context.userEnabled) return false;
  // Typing is the one time the screen must be trustworthy: a scrambled row
  // under a cursor reads as the BBS having eaten the input.
  if (context.isTyping) return false;
  if (context.isSecret) return false;
  if (context.isTransferring) return false;
  return true;
}

/**
 * Decide whether to glitch on this tick, and mutate the state if so.
 *
 * Returns null far more often than not. The ceiling is applied before the
 * dice so a run of lucky rolls cannot produce a burst.
 */
export function planGlitch(
  now: number,
  state: GlitchState,
  rowCount: number,
  random: Random
): GlitchPlan | null {
  if (rowCount <= 0) return null;

  if (now - state.minuteStartedAt >= 60_000) {
    state.minuteStartedAt = now;
    state.firedThisMinute = 0;
  }
  if (state.firedThisMinute >= MAX_PER_MINUTE) return null;
  // The gap is whatever was drawn after the previous glitch, not a
  // constant - see drawGap.
  const gap = state.nextGapMs || MIN_GAP_MS;
  if (state.lastAt !== 0 && now - state.lastAt < gap) return null;
  if (random() >= CHANCE) return null;

  const kinds: GlitchKind[] = [
    'scramble', 'shift', 'dropout', 'tear', 'blocks', 'caseflip', 'invert', 'fade',
  ];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(random() * kinds.length))];
  const row = Math.min(rowCount - 1, Math.floor(random() * rowCount));

  state.lastAt = now;
  state.nextGapMs = drawGap(random);
  state.firedThisMinute++;

  // Long enough to register, short enough that it reads as a flicker rather
  // than as the screen being wrong.
  return { kind, row, durationMs: 90 + Math.floor(random() * 110) };
}

/** The glyphs a scramble reaches for. Block and box shapes read as corruption. */
const NOISE = '▓▒░█▚▞╱╲┤├┼╳';

/**
 * The damaged version of one row.
 *
 * Pure: the input string is never modified, the same row and random source
 * always give the same output, and the result is ALWAYS the same display
 * width as the input. That last part matters more than it looks - a glitch
 * that changes a row's length would push a border out of alignment, and the
 * repaint that follows would not put it back.
 */
export function damageRow(text: string, kind: GlitchKind, random: Random): string {
  if (text.length === 0) return text;
  const chars = [...text];

  switch (kind) {
    case 'scramble': {
      // A few characters, not a field of them.
      const hits = 1 + Math.floor(random() * Math.min(4, chars.length));
      for (let i = 0; i < hits; i++) {
        const at = Math.floor(random() * chars.length);
        if (chars[at] === ' ') continue;   // holes in whitespace read as nothing
        chars[at] = NOISE[Math.floor(random() * NOISE.length)];
      }
      return chars.join('');
    }
    case 'shift': {
      // Slide the row sideways, keeping its width by wrapping.
      const by = 1 + Math.floor(random() * 2);
      return chars.slice(-by).join('') + chars.slice(0, -by).join('');
    }
    case 'dropout': {
      const start = Math.floor(random() * chars.length);
      const len = 1 + Math.floor(random() * Math.min(6, chars.length - start || 1));
      for (let i = start; i < Math.min(chars.length, start + len); i++) {
        chars[i] = ' ';
      }
      return chars.join('');
    }
    case 'blocks': {
      // A solid run, as if a few cells lost their character data entirely.
      const start = Math.floor(random() * chars.length);
      const len = 2 + Math.floor(random() * Math.min(5, Math.max(1, chars.length - start)));
      const solid = '█▓▒░'[Math.floor(random() * 4)];
      for (let i = start; i < Math.min(chars.length, start + len); i++) {
        if (chars[i] !== ' ') chars[i] = solid;
      }
      return chars.join('');
    }
    case 'caseflip': {
      // Letters change case. Cheap, width-safe, and reads as a bad line
      // rather than as damage to the door itself.
      const hits = 2 + Math.floor(random() * Math.min(6, chars.length));
      for (let i = 0; i < hits; i++) {
        const at = Math.floor(random() * chars.length);
        const c = chars[at];
        if (c >= 'a' && c <= 'z') chars[at] = c.toUpperCase();
        else if (c >= 'A' && c <= 'Z') chars[at] = c.toLowerCase();
      }
      return chars.join('');
    }
    case 'tear':
    case 'invert':
    case 'fade':
    default:
      // A tear changes no characters at all - the caller renders the row in
      // the accent colour instead. Returning the text unchanged is the
      // point: the damage is entirely in the colour.
      return text;
  }
}

/** True when this kind is drawn by recolouring rather than by rewriting. */
export function isColourOnly(kind: GlitchKind): boolean {
  return kind === 'tear' || kind === 'invert' || kind === 'fade';
}
