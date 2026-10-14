/**
 * Typing a teletext page number, and the decoder looking for it.
 *
 * A real set did not jump to page 120 the instant the third digit went in.
 * The header showed P1__, then P12_, then P120, and the page counter beside it
 * ran through the numbers of the broadcast cycle until the wanted page came
 * round and the decoder could grab it. This module is that behaviour, written
 * once for every door that has page numbers (TELETEXT, MAG), and it knows
 * nothing about how a door paints: the door hands in what a header looks like
 * (`header`), how to put the normal one back (`restore`) and what landing
 * means (`land`).
 *
 * THE FAKE SEARCH
 * After the third digit the counter rolls upward from the page the caller is
 * on, wrapping at the end of the range, until it reaches the target, and the
 * page lands one tick later. The roll is bounded by construction, not by a
 * clock: at most SEARCH_MAX_FRAMES frames at SEARCH_TICK_MS apart, so a
 * search can never take longer than SEARCH_MAX_MS (1.5 s). A short hop is
 * fewer frames than a long one, so the delay is roughly proportional to the
 * distance. Any key skips it. The roll costs one header row per tick; the
 * door must repaint nothing else.
 *
 * NO ROLL ON A SMALL SCREEN
 * `effectsAllowed(width)` is false at 40 columns (and so for PETSCII): a
 * moving counter there leaves stray glyphs. The caller sees a static
 * "SEARCHING P120" and the page loads in the same breath. No timer is made.
 *
 * Timers are unref()'d, and `dispose()` clears them, so a search never keeps
 * a door process alive or paints into a socket that has gone.
 */
import { effectsAllowed } from '../engines/ui/blessed/core/responsive-constants';

/** One counter step. 75 ms is fast enough to read as rolling, slow enough to survive a modem. */
export const SEARCH_TICK_MS = 75;
/** The most counter frames one search shows. */
export const SEARCH_MAX_FRAMES = 18;
/** The longest a search can take: every frame plus the tick that lands the page. 1425 ms. */
export const SEARCH_MAX_MS = (SEARCH_MAX_FRAMES + 1) * SEARCH_TICK_MS;
/** How long PAGE NOT FOUND stays up before the header comes back. */
export const NOT_FOUND_MS = 1200;
/** A search always shows at least this many frames when the distance allows it. */
const MIN_FRAMES = 3;

/** How a number that is not a page reads. */
export const NOT_FOUND_TEXT = 'PAGE NOT FOUND';

/** The page numbers a door has, in broadcast order, and how one is written. */
export interface PageSpace {
  readonly pages: readonly number[];
  format(page: number): string;
}

/** Every number from `first` to `last`. TELETEXT's are hexadecimal, MAG's decimal: `format` says which. */
export function rangeSpace(first: number, last: number, format: (page: number) => string): PageSpace {
  const pages: number[] = [];
  for (let page = first; page <= last; page++) pages.push(page);
  return { pages, format };
}

/** First index whose page is >= `page` (pages.length when none is). */
function lowerBound(pages: readonly number[], page: number): number {
  let lo = 0;
  let hi = pages.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid] < page) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The pages the counter shows on the way from `from` to `to`, ending on `to`.
 *
 * Upward from `from` (exclusive), wrapping past the last page to the first.
 * The offsets are strictly increasing, so the sequence is monotonic apart
 * from the one wrap, and there are never more than `maxFrames` of them.
 * `from` need not be a page in the space; the roll starts above it.
 */
export function rollFrames(
  space: PageSpace,
  from: number,
  to: number,
  maxFrames: number = SEARCH_MAX_FRAMES,
): number[] {
  const { pages } = space;
  const n = pages.length;
  const target = lowerBound(pages, to);
  if (n === 0 || pages[target] !== to) return [to];

  const at = lowerBound(pages, from);
  const base = pages[at] === from ? at : at - 1;
  const distance = (((target - base) % n) + n) % n;
  if (distance === 0) return [to];

  const wanted = Math.max(MIN_FRAMES, Math.ceil((maxFrames * distance) / n));
  const frames = Math.min(distance, wanted, maxFrames);
  const out: number[] = [];
  for (let i = 1; i <= frames; i++) {
    out.push(pages[(base + Math.round((i * distance) / frames) + n) % n]);
  }
  return out;
}

/** How long a search that shows `frames` frames takes, the landing tick included. */
export function searchDurationMs(frames: number): number {
  return (frames + 1) * SEARCH_TICK_MS;
}

export interface PageSearchTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: PageSearchTimers = {
  set: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    return handle;
  },
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type PageSearchPhase = 'idle' | 'entry' | 'searching' | 'notfound';

export interface PageSearchOptions {
  space: PageSpace;
  /** The caller's terminal width. `effectsAllowed(width)` decides between the roll and the static line. */
  width: number;
  /** Three typed digits to a page number, or null when they are outside the door's range. */
  parse(digits: string): number | null;
  /** Whether the door has this page. */
  exists(page: number): boolean;
  /** The page the caller is on now: the roll starts above it. */
  current(): number;
  /** Paint the counter in the header. The ONLY thing a tick does. */
  header(text: string, phase: PageSearchPhase): void;
  /** Put the normal header back after a cancel or a PAGE NOT FOUND. */
  restore(): void;
  /** Show the page. The door paints it, which replaces the header. */
  land(page: number): void;
  timers?: PageSearchTimers;
}

/**
 * The keys the machine reads. A digit is the character; the three named keys
 * are 'escape', 'backspace' and 'enter'; anything else is any other string.
 */
export type PageSearchKey = string;

const isDigit = (key: string): boolean => key.length === 1 && key >= '0' && key <= '9';

export class PageSearch {
  private readonly o: PageSearchOptions;
  private readonly timers: PageSearchTimers;
  private readonly rolls: boolean;
  private digits = '';
  private current: PageSearchPhase = 'idle';
  private shown = '';
  private handle: unknown = null;
  private frames: number[] = [];
  private frameAt = 0;
  private target = 0;

  constructor(options: PageSearchOptions) {
    this.o = options;
    this.timers = options.timers ?? realTimers;
    this.rolls = effectsAllowed(options.width);
  }

  get phase(): PageSearchPhase {
    return this.current;
  }

  /** What the header counter says now ('' while idle). */
  get text(): string {
    return this.shown;
  }

  /** Whether the machine is doing anything a door must not paint over. */
  get active(): boolean {
    return this.current !== 'idle';
  }

  /**
   * Offer a key. True when the machine took it; false means the door handles
   * it as it always did. While idle only a digit is taken, so every other key
   * keeps its meaning; once a number is being typed or searched for, the keys
   * that would leave it (Escape, Backspace, Enter, any other key) end it
   * first, and a key that only ends it is also taken.
   */
  feed(key: PageSearchKey): boolean {
    switch (this.current) {
      case 'idle':
        if (!isDigit(key)) return false;
        this.begin(key);
        return true;

      case 'entry':
        if (isDigit(key)) {
          this.digits += key;
          if (this.digits.length < 3) this.show(this.entryText(), 'entry');
          else this.resolve();
          return true;
        }
        this.cancel();
        return key === 'escape' || key === 'backspace' || key === 'enter';

      case 'searching':
        // Any key skips the wait; a skip is all that key does.
        this.land();
        return true;

      case 'notfound': {
        this.cancel();
        if (isDigit(key)) {
          this.begin(key);
          return true;
        }
        return key === 'escape' || key === 'backspace' || key === 'enter';
      }
    }
  }

  /** Abandon what is typed or shown and put the normal header back. */
  cancel(): void {
    if (this.current === 'idle') return;
    this.stop();
    this.o.restore();
  }

  /** Clear the timer and forget everything, painting nothing. For exit and view changes. */
  dispose(): void {
    this.stop();
  }

  private stop(): void {
    if (this.handle !== null) {
      this.timers.clear(this.handle);
      this.handle = null;
    }
    this.digits = '';
    this.frames = [];
    this.frameAt = 0;
    this.current = 'idle';
    this.shown = '';
  }

  private begin(digit: string): void {
    this.digits = digit;
    this.show(this.entryText(), 'entry');
  }

  private entryText(): string {
    return `P${this.digits}${'_'.repeat(3 - this.digits.length)}`;
  }

  private show(text: string, phase: PageSearchPhase): void {
    this.current = phase;
    this.shown = text;
    this.o.header(text, phase);
  }

  private resolve(): void {
    const typed = this.digits;
    const page = this.o.parse(typed);
    if (page === null || !this.o.exists(page)) {
      this.show(NOT_FOUND_TEXT, 'notfound');
      this.handle = this.timers.set(() => {
        this.handle = null;
        this.cancel();
      }, NOT_FOUND_MS);
      return;
    }

    this.target = page;
    const label = this.o.space.format(page);
    if (!this.rolls) {
      // A 40-column screen has no cells to spare for a moving counter.
      this.show(`SEARCHING P${label}`, 'searching');
      this.land();
      return;
    }

    this.frames = rollFrames(this.o.space, this.o.current(), page);
    this.frameAt = 0;
    this.show(`P${label}`, 'searching');
    this.schedule();
  }

  private schedule(): void {
    this.handle = this.timers.set(() => {
      this.handle = null;
      this.tick();
    }, SEARCH_TICK_MS);
  }

  private tick(): void {
    if (this.current !== 'searching') return;
    if (this.frameAt < this.frames.length) {
      const frame = this.frames[this.frameAt++];
      this.show(`P${this.o.space.format(frame)}`, 'searching');
      this.schedule();
      return;
    }
    this.land();
  }

  private land(): void {
    const page = this.target;
    this.stop();
    this.o.land(page);
  }
}
