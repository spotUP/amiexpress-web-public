/**
 * The page-number entry and the fake carousel search.
 *
 * Driven with a manual scheduler, so the delays asserted here are the ones
 * the machine asks for, not what a loaded CI box happened to give it.
 */
import {
  NOT_FOUND_MS,
  NOT_FOUND_TEXT,
  PageSearch,
  SEARCH_MAX_FRAMES,
  SEARCH_MAX_MS,
  SEARCH_TICK_MS,
  rangeSpace,
  rollFrames,
  searchDurationMs,
  type PageSearchOptions,
  type PageSearchPhase,
} from '../../teletext/page-search';
import { formatPageNumber } from '../../teletext/store';

const DECIMAL = rangeSpace(100, 999, String);
const HEX = rangeSpace(0x100, 0x8ff, formatPageNumber);

/** A scheduler the test winds by hand; records every timer it was asked for. */
function manualTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  let created = 0;
  return {
    timers: {
      set(fn: () => void, ms: number) {
        created++;
        const id = next++;
        pending.set(id, { at: now + ms, fn });
        return id;
      },
      clear(handle: unknown) {
        pending.delete(handle as number);
      },
    },
    created: () => created,
    pending: () => pending.size,
    /** Run the next timer; returns the elapsed total, or -1 when none is pending. */
    step(): number {
      const first = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first) return -1;
      pending.delete(first[0]);
      now = first[1].at;
      first[1].fn();
      return now;
    },
    elapsed: () => now,
  };
}

interface Rig {
  search: PageSearch;
  clock: ReturnType<typeof manualTimers>;
  headers: Array<{ text: string; phase: PageSearchPhase }>;
  landed: number[];
  restored: () => number;
}

function rig(options: Partial<PageSearchOptions> & { have?: number[] } = {}): Rig {
  const clock = manualTimers();
  const headers: Array<{ text: string; phase: PageSearchPhase }> = [];
  const landed: number[] = [];
  let restores = 0;
  const have = options.have;
  const search = new PageSearch({
    space: DECIMAL,
    width: 80,
    parse: digits => (/^[1-9]\d\d$/.test(digits) ? Number(digits) : null),
    exists: page => (have ? have.includes(page) : true),
    current: () => 100,
    header: (text, phase) => headers.push({ text, phase }),
    restore: () => { restores++; },
    land: page => landed.push(page),
    timers: clock.timers,
    ...options,
  });
  return { search, clock, headers, landed, restored: () => restores };
}

const type = (r: Rig, digits: string) => { for (const d of digits) r.search.feed(d); };

describe('typing a page number', () => {
  it('shows P1__ then P12_ then P120 in the header as the digits go in', () => {
    const r = rig();
    r.search.feed('1');
    expect(r.search.text).toBe('P1__');
    r.search.feed('2');
    expect(r.search.text).toBe('P12_');
    r.search.feed('0');
    expect(r.headers.map(h => h.text).slice(0, 3)).toEqual(['P1__', 'P12_', 'P120']);
    expect(r.search.phase).toBe('searching');
  });

  it('takes digits and nothing else while idle, so every other key keeps its meaning', () => {
    const r = rig();
    for (const key of ['q', 'escape', 'backspace', 'enter', 'p', 'down']) {
      expect(r.search.feed(key)).toBe(false);
    }
    expect(r.headers).toEqual([]);
    expect(r.search.feed('4')).toBe(true);
  });

  it('cancels on Escape, Backspace or Enter and puts the header back', () => {
    for (const key of ['escape', 'backspace', 'enter']) {
      const r = rig();
      type(r, '12');
      expect(r.search.feed(key)).toBe(true);
      expect(r.search.phase).toBe('idle');
      expect(r.restored()).toBe(1);
      expect(r.landed).toEqual([]);
    }
  });

  it('cancels on another key and hands that key back to the door', () => {
    const r = rig();
    type(r, '1');
    expect(r.search.feed('q')).toBe(false);
    expect(r.search.phase).toBe('idle');
    expect(r.restored()).toBe(1);
  });
});

describe('a number that is not a page', () => {
  it('says PAGE NOT FOUND for a number outside the door range, then clears itself', () => {
    const r = rig();
    type(r, '050');
    expect(r.search.text).toBe(NOT_FOUND_TEXT);
    expect(r.search.phase).toBe('notfound');
    expect(r.clock.pending()).toBe(1);
    expect(r.clock.step()).toBe(NOT_FOUND_MS);
    expect(r.search.phase).toBe('idle');
    expect(r.restored()).toBe(1);
    expect(r.landed).toEqual([]);
  });

  it('says PAGE NOT FOUND for a number in range that the door does not have', () => {
    const r = rig({ have: [100, 200] });
    type(r, '555');
    expect(r.search.text).toBe(NOT_FOUND_TEXT);
    expect(r.landed).toEqual([]);
  });

  it('starts a fresh entry when a digit follows the notice', () => {
    const r = rig({ have: [100] });
    type(r, '555');
    r.search.feed('1');
    expect(r.search.text).toBe('P1__');
    expect(r.clock.pending()).toBe(0);
  });
});

describe('the fake search', () => {
  it('rolls the counter upward from the current page and lands exactly on the target', () => {
    const r = rig({ current: () => 100 });
    type(r, '120');
    const shown: number[] = [];
    while (r.clock.pending()) {
      r.clock.step();
      const text = r.headers[r.headers.length - 1].text;
      if (r.landed.length === 0) shown.push(Number(text.slice(1)));
    }
    expect(r.landed).toEqual([120]);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[shown.length - 1]).toBe(120);
    expect(shown.every((n, i) => i === 0 || n > shown[i - 1])).toBe(true);
    expect(shown.every(n => n > 100 && n <= 120)).toBe(true);
  });

  it('wraps past the last page when the target is below the current page', () => {
    const frames = rollFrames(DECIMAL, 900, 150);
    expect(frames[frames.length - 1]).toBe(150);
    const wrap = frames.findIndex((n, i) => i > 0 && n < frames[i - 1]);
    expect(wrap).toBeGreaterThan(0);
    // Monotonic apart from that one wrap.
    const before = frames.slice(0, wrap);
    const after = frames.slice(wrap);
    expect(before.every((n, i) => i === 0 || n > before[i - 1])).toBe(true);
    expect(after.every((n, i) => i === 0 || n > after[i - 1])).toBe(true);
    expect(before.every(n => n > 900)).toBe(true);
    expect(after.every(n => n <= 150)).toBe(true);
  });

  it('rolls through hexadecimal page numbers in the teletext space', () => {
    const frames = rollFrames(HEX, 0x100, 0x1a0);
    expect(frames[frames.length - 1]).toBe(0x1a0);
    expect(frames.every((n, i) => i === 0 || n > frames[i - 1])).toBe(true);
    expect(frames.some(n => /[A-F]/.test(formatPageNumber(n)))).toBe(true);
  });

  it('never takes longer than the cap, whatever the distance', () => {
    let longest = 0;
    for (const [from, to] of [[100, 999], [999, 100], [100, 101], [500, 499], [100, 550], [321, 321]]) {
      const frames = rollFrames(DECIMAL, from, to);
      expect(frames.length).toBeLessThanOrEqual(SEARCH_MAX_FRAMES);
      longest = Math.max(longest, searchDurationMs(frames.length));
    }
    expect(longest).toBeLessThanOrEqual(SEARCH_MAX_MS);
    expect(SEARCH_MAX_MS).toBeLessThanOrEqual(1500);
  });

  it('measures the real elapsed time of the longest search against the cap', () => {
    const r = rig({ current: () => 100 });
    type(r, '999');
    let end = 0;
    while (r.clock.pending()) end = r.clock.step();
    expect(r.landed).toEqual([999]);
    expect(end).toBeLessThanOrEqual(SEARCH_MAX_MS);
    expect(end).toBeGreaterThan(SEARCH_MAX_MS - 2 * SEARCH_TICK_MS);
  });

  it('takes longer for a far page than a near one', () => {
    const near = rollFrames(DECIMAL, 100, 103).length;
    const far = rollFrames(DECIMAL, 100, 700).length;
    expect(far).toBeGreaterThan(near);
  });

  it('lands at once on any key, taking that key', () => {
    const r = rig();
    type(r, '500');
    r.clock.step();
    expect(r.landed).toEqual([]);
    expect(r.search.feed('x')).toBe(true);
    expect(r.landed).toEqual([500]);
    expect(r.clock.pending()).toBe(0);
    expect(r.search.phase).toBe('idle');
  });

  it('lands on the page it already is on without rolling past it', () => {
    expect(rollFrames(DECIMAL, 120, 120)).toEqual([120]);
  });
});

describe('a screen with no room for effects', () => {
  it('shows a static SEARCHING line and lands in the same breath, without making a timer', () => {
    const r = rig({ width: 40 });
    type(r, '120');
    expect(r.headers.map(h => h.text)).toEqual(['P1__', 'P12_', 'SEARCHING P120']);
    expect(r.landed).toEqual([120]);
    expect(r.clock.created()).toBe(0);
    expect(r.search.phase).toBe('idle');
  });

  it('still reports PAGE NOT FOUND', () => {
    const r = rig({ width: 40, have: [100] });
    type(r, '555');
    expect(r.search.text).toBe(NOT_FOUND_TEXT);
  });
});

describe('timers', () => {
  it('are cleared when the door leaves mid-search', () => {
    const r = rig();
    type(r, '500');
    expect(r.clock.pending()).toBe(1);
    r.search.dispose();
    expect(r.clock.pending()).toBe(0);
    expect(r.search.phase).toBe('idle');
    expect(r.landed).toEqual([]);
  });

  it('are unref()d on the real scheduler', () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const search = new PageSearch({
      space: DECIMAL,
      width: 80,
      parse: d => Number(d),
      exists: () => true,
      current: () => 100,
      header: () => {},
      restore: () => {},
      land: () => {},
    });
    try {
      for (const d of '300') search.feed(d);
      const handle = spy.mock.results[spy.mock.results.length - 1].value as NodeJS.Timeout;
      expect(handle.hasRef()).toBe(false);
    } finally {
      search.dispose();
      spy.mockRestore();
    }
  });
});
