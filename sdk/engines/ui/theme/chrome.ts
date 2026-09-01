/**
 * The chrome the mockups specified: mastheads, dotted leaders, and the
 * slash rail that carries the branding.
 *
 * Everything here is a pure function over a width and some text, so the
 * layouts can be tested rather than squinted at. The animation is a
 * separate, thin runner at the bottom - the same split as the glitches,
 * for the same reason.
 *
 * The costs come from a measurement, not from taste. A 68K door pays about
 * 45ms of emulation per 198-byte XIM message, so a moving row is only
 * affordable while it stays inside ONE message:
 *
 *   the rail cycling        ~12 bytes a second   fine
 *   a header sweep          ~400 bytes, once     fine
 *   a dotted leader filling ~160 bytes a second  fine
 *   anything full-screen    ~13KB a second       never
 *
 * TypeScript doors, which is where these actually run, are far cheaper -
 * but the ceiling keeps an effect from ever being why a screen feels slow.
 */
import type { Theme } from './tokens.js';

/** The character a leader is drawn with. Middle dot reads as a rule, not text. */
export const LEADER_CHAR = '·';

/**
 * A masthead: rail, title, a leader across the gap, and a value at the right.
 *
 * `///// D O O R R E P O ···························· 4096`
 *
 * Returns PLAIN text - the caller colours it, because who gets the accent
 * differs per door. Always exactly `width` characters: a masthead that
 * overran would wrap and take the row below it with it.
 */
export function mastheadLine(
  width: number,
  rail: string,
  title: string,
  right = '',
  align: 'left' | 'right' = 'left'
): string {
  if (width <= 0) return '';

  // Right-aligned: the headline sits at the end and the whole run up to it
  // is slashes. Louder than a leader and more obviously branding - the
  // mark stops being a prefix and becomes the bar the title rides on.
  if (align === 'right' && rail) {
    const tail = right ? `${title}  ${right}` : title;
    const room = width - tail.length - 1;
    if (room < 1) {
      return tail.slice(-width).padStart(width);
    }
    return `${railPattern(rail, room)} ${tail}`.slice(0, width).padEnd(width);
  }

  const left = rail ? `${rail} ${title}` : title;
  // Right value first: it is the part that must never be truncated, since
  // it is usually a count or a clock and a half-drawn number is worse than
  // no number.
  const room = width - left.length - right.length - 2;

  if (room < 1) {
    // Not enough space for a leader. Trim the TITLE rather than the value
    // or the branding.
    const trimmed = Math.max(0, width - rail.length - right.length - 3);
    const shortTitle = title.slice(0, trimmed);
    const head = rail ? `${rail} ${shortTitle}` : shortTitle;
    return (head + ' ' + right).slice(0, width).padEnd(width);
  }

  return `${left} ${LEADER_CHAR.repeat(room)} ${right}`.slice(0, width).padEnd(width);
}


/**
 * The rail repeated to fill `width`, cut to length.
 *
 * `///` across twelve columns is `////////////` - the pattern continues
 * rather than the mark repeating with gaps, so a wide header reads as one
 * bar rather than as a row of separate marks.
 */
export function railPattern(rail: string, width: number, gap = 0, offset = 0): string {
  if (!rail || width <= 0) return '';

  // `gap` spaces the marks out: `/ / / / /` rather than `/////`. It is not
  // only prettier - it is what makes the bar able to MOVE. A run of
  // identical slashes shifted by a column is the same run, so a solid bar
  // can only ever animate by colour; a spaced one can travel.
  const unit = gap > 0 ? rail + ' '.repeat(gap) : rail;
  const shift = ((offset % unit.length) + unit.length) % unit.length;
  const repeats = Math.ceil((width + shift) / unit.length) + 1;
  return unit.repeat(repeats).slice(shift, shift + width);
}

/**
 * The rail, shifted for this tick.
 *
 * `///` becomes ` //`, then `  /`, then `///` again - the slashes appear to
 * travel. Three characters redrawn, which is why this is the one animation
 * that can run continuously.
 */
export function railFrame(rail: string, tick: number): string {
  if (!rail) return '';
  // The period is the rail's own length, so the cycle never includes a
  // frame where the mark has vanished entirely - an empty slot reads as
  // the branding having broken rather than as movement.
  const period = rail.length;
  const shift = ((tick % period) + period) % period;
  if (shift === 0) return rail;
  return ' '.repeat(shift) + rail.slice(0, rail.length - shift);
}

/**
 * The frames of a sweep: the rail travelling across `width` and away.
 *
 * Played once when a screen opens. Five or six frames is enough to read as
 * motion; more is a loading bar nobody asked for.
 */
export function sweepFrames(rail: string, width: number, frames = 6): string[] {
  if (!rail || width <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < frames; i++) {
    const at = Math.floor((width - rail.length) * (i / Math.max(1, frames - 1)));
    out.push((' '.repeat(Math.max(0, at)) + rail).slice(0, width).padEnd(width));
  }
  return out;
}



/**
 * A ring of irregular slash runs, windowed at `offset`.
 *
 * `///////////// //// /////////// / ///////` - runs and gaps of varying
 * length, which reads as data streaming rather than as a dotted rule.
 *
 * The pattern is generated ONCE from `seed` and then scrolled. That is the
 * whole trick: re-randomising every frame would flicker, not travel. The
 * same seed and width always give the same ring, so a door's bar is stable
 * across redraws and a test can assert on it.
 *
 * The ring is longer than the window and wraps, so scrolling never runs out
 * and never shows a seam of empty space.
 */
export function railStream(
  rail: string,
  width: number,
  offset = 0,
  seed = 1
): string {
  if (!rail || width <= 0) return '';

  // A small deterministic generator. Not random enough for anything that
  // matters and exactly random enough for this.
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  const ringLength = Math.max(width * 2, 64);
  let ring = '';
  while (ring.length < ringLength) {
    const runMarks = 2 + Math.floor(next() * 7);        // 2-8 marks
    const gap = 1 + Math.floor(next() * 3);             // 1-3 spaces
    ring += rail.repeat(runMarks) + ' '.repeat(gap);
  }

  const start = ((offset % ring.length) + ring.length) % ring.length;
  // Doubled so a window near the end wraps cleanly rather than falling short.
  return (ring + ring).slice(start, start + width);
}

/**
 * The lit part of a scanning bar, for this tick.
 *
 * A run of identical slashes cannot show motion by shifting - `/////`
 * moved one column is still `/////`. So the bar stays still and the
 * BRIGHTNESS travels along it: a short segment in the accent colour
 * sliding through a dim run, which is the effect the mockups were after
 * and the reason the rail is drawn in two colours rather than one.
 *
 * Returns the half-open range to light up. Wraps, so the segment leaves
 * the right edge and re-enters at the left.
 */
export function scanSegment(
  width: number,
  tick: number,
  size = 3
): { start: number; end: number } {
  if (width <= 0) return { start: 0, end: 0 };
  const span = Math.max(1, Math.min(size, width));
  const start = ((tick % width) + width) % width;
  return { start, end: Math.min(width, start + span) };
}

/**
 * The bar drawing itself in, frame by frame, for an entry animation.
 *
 * Grows from nothing to the full run. Played once when a screen opens; a
 * handful of frames reads as the header arriving rather than as a progress
 * bar for something.
 */
export function barGrowFrames(rail: string, width: number, frames = 6): string[] {
  if (!rail || width <= 0) return [];
  const out: string[] = [];
  for (let i = 1; i <= frames; i++) {
    const upto = Math.round((width * i) / frames);
    out.push(railPattern(rail, upto).padEnd(width));
  }
  return out;
}

/**
 * A leader that doubles as a progress bar.
 *
 * The dots fill from the left as `done/total` advances, which turns a wait
 * into something to look at without drawing a bar anybody has to explain.
 * Returns exactly `width` characters.
 */
export function leaderProgress(width: number, done: number, total: number): string {
  if (width <= 0) return '';
  if (total <= 0) return LEADER_CHAR.repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)));
  return LEADER_CHAR.repeat(filled) + ' '.repeat(width - filled);
}

/**
 * The marker drawn beside the selected row.
 *
 * Quiet Phosphor has no borders and no selection BLOCK - it carries
 * hierarchy in brightness alone - so it needs a mark to say where the
 * cursor is. Themes that highlight the whole row do not.
 */
export function selectionMark(theme: Theme): string {
  return theme.border === 'none' ? '▍' : '';
}

/** What a rail animation needs from its element. */
export interface RailTarget {
  setContent(text: string): void;
}

export interface RailOptions {
  /** How often the rail moves. One shift a second reads as alive, not busy. */
  tickMs?: number;
  /** Rebuild the whole line for this rail frame. */
  line: (railNow: string) => string;
}

/**
 * Cycle the rail until the returned function is called.
 *
 * Does nothing when the theme has no rail - classic starts no timer, so it
 * pays nothing for this existing.
 */
export function attachRail(
  target: RailTarget,
  theme: Theme,
  render: () => void,
  options: RailOptions
): () => void {
  if (!theme.rail) return () => { /* nothing was started */ };

  const tickMs = options.tickMs ?? 1_000;
  let tick = 0;

  const timer = setInterval(() => {
    tick++;
    target.setContent(options.line(railFrame(theme.rail, tick)));
    render();
  }, tickMs);

  return () => {
    clearInterval(timer);
    // Leave the rail as it was drawn, not mid-shift.
    target.setContent(options.line(theme.rail));
    render();
  };
}

/** What a masthead needs to know about the door that owns it. */
export interface MastheadOptions {
  /** The headline, right of the rail. */
  title: string;
  /** Columns available. One short of the screen width - see below. */
  width: number;
  /** Paint the rail run. Usually `s.accent`. */
  rail: (text: string) => string;
  /** Paint the title. Usually `s.ink`. */
  ink: (text: string) => string;
  /** Repaint after each frame. */
  render: () => void;
  /**
   * Varies the irregular pattern between nodes, so two people on the same
   * board are not watching an identical bar. Node id is the usual source.
   */
  seed?: number;
  /** Frames of the draw-in. 0 skips straight to the moving bar. */
  entryFrames?: number;
}

/** What a masthead draws into. */
export interface MastheadTarget {
  setContent(text: string): void;
}

/**
 * The animated masthead: a slash rail that draws itself in, then slides.
 *
 * Extracted from DOORS, which is the screen the sysop measured the others
 * against - "it doesnt look even close to how cool DOORS looks" was said of
 * a door that had been given the theme's COLOURS and none of its chrome.
 * Colour was never what made that screen read as designed; the moving rail
 * was. One implementation here beats six hand-rolled copies that drift.
 *
 * Returns the stop function, which also leaves the bar drawn at rest rather
 * than mid-slide. Does nothing at all for a theme with no rail - classic
 * starts no timer and pays nothing for this existing.
 *
 * Cost: one row redrawn per tick, ~200 bytes, 20 times a second. That is
 * affordable for a TypeScript door (a socket write and an xterm parse) and
 * NOT something to copy into a 68K door, which pays ~45ms of emulation per
 * message. See the cost table at the top of this file.
 */
export function attachMasthead(
  target: MastheadTarget,
  theme: Theme,
  options: MastheadOptions
): () => void {
  const { title, width, rail, ink, render, seed = 1, entryFrames = 6 } = options;

  // No rail: draw the plain title once and start nothing.
  if (!theme.rail) {
    target.setContent(` ${title} `);
    render();
    return () => { /* nothing was started */ };
  }

  // One column short of `width` is the caller's job, but the run is sized
  // here: writing a row's final cell leaves the terminal in a pending-wrap
  // state and the last character is clipped or pushed to the next line.
  const runWidth = Math.max(0, width - title.length - 1);

  let tick = 0;
  let barWidth: number | null = null;

  const line = (): string => {
    const shown = barWidth === null ? runWidth : Math.min(barWidth, runWidth);
    const run = railStream(theme.rail, shown, tick, seed).padEnd(runWidth);
    return `${rail(run)} ${ink(title)}`;
  };

  const draw = () => {
    target.setContent(line());
    render();
  };

  let entryTimer: ReturnType<typeof setInterval> | null = null;
  let slideTimer: ReturnType<typeof setInterval> | null = null;

  const startSliding = () => {
    barWidth = null;
    tick = 0;
    slideTimer = setInterval(() => {
      tick++;
      draw();
      // 20 frames a second. A terminal cannot move less than a whole cell,
      // so smoothness is entirely frame RATE and an even interval.
    }, 50);
  };

  const frames = entryFrames > 0 ? barGrowFrames(theme.rail, runWidth, entryFrames) : [];
  if (frames.length === 0) {
    draw();
    startSliding();
  } else {
    let frame = 0;
    entryTimer = setInterval(() => {
      barWidth = frames[frame] ? frames[frame].trimEnd().length : runWidth;
      draw();
      if (++frame >= frames.length) {
        if (entryTimer) clearInterval(entryTimer);
        entryTimer = null;
        startSliding();
      }
    }, 60);
  }

  return () => {
    if (entryTimer) clearInterval(entryTimer);
    if (slideTimer) clearInterval(slideTimer);
    entryTimer = null;
    slideTimer = null;
    // Leave it at rest, not mid-slide.
    barWidth = null;
    tick = 0;
    draw();
  };
}

/** One hint in a footer: the key to press, and what it does. */
export interface FooterHint {
  /** The key cap, e.g. 'Q' or 'Up/Down'. Drawn in the accent. */
  key: string;
  /** What it does. Drawn dim, because the CAP is the part worth reading. */
  does: string;
}

/**
 * The hint line for the bottom of a door's screen.
 *
 * A footer is not a panel. Bordering it makes it read as a separate box
 * parked at the bottom rather than as part of the screen, so this returns
 * plain content for a ONE-ROW, unframed box using the bar's colours.
 *
 * The key cap carries the accent and the description sits dim: bright text
 * throughout makes the hint line compete with the content above it.
 *
 * Extracted from DOORS after the sysop found the other doors had no footer
 * at all - the dashboard's status line was unstyled text and the theme
 * picker's hints floated mid-screen under the list.
 */
export function footerHints(
  hints: readonly FooterHint[],
  paint: { key: (t: string) => string; dim: (t: string) => string },
  rail = ''
): string {
  const line = hints
    .map(h => `${paint.key(h.key + ':')} ${paint.dim(h.does)}`)
    .join('  ');
  // The rail at the end is branding, not a hint, so it stays dim.
  return rail ? `${line}  ${paint.dim(rail)}` : line;
}

/** The style a footer row takes: the bar's colours, dim text, no border. */
export function footerStyle(theme: Theme): { fg: string; bg: string } {
  return { fg: theme.tokens.dim, bg: theme.tokens.bar };
}
