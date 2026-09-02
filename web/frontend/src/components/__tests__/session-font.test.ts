/**
 * Unit tests for the one owner of the session font
 * (packages/terminal/src/utils/session-font.ts).
 *
 * The board font used to be assembled inline in two socket handlers, each
 * with its own copy of the line-height map, while the terminal was
 * constructed from a third value (XTERM_CONFIG.fontFamily = mOsOul). This
 * module is the single source of truth those three collapsed into.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_BBS_FONT,
  BBS_FONTS,
  FONT_CACHE_KEY,
  FALLBACK_FONT_STACK,
  fontFamilyFor,
  lineHeightFor,
  isBbsFont,
  readCachedFont,
  writeCachedFont,
  waitForFontFace,
  forceRemeasure,
  applyFont,
} from '../../../../../packages/terminal/src/utils/session-font';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('session font defaults', () => {
  it('defaults to the same font the backend defaults to', () => {
    // web/backend/src/server/preference-socket-handlers.ts and
    // repositories/user-repository.ts both default to this exact string.
    expect(DEFAULT_BBS_FONT).toBe('TopazPlus_a1200');
    expect(BBS_FONTS).toContain(DEFAULT_BBS_FONT);
  });

  it('builds the BBS font stack with the bitmap face first', () => {
    expect(fontFamilyFor('Topaz_a1200')).toBe('Topaz_a1200, "Courier New", monospace');
  });
});

describe('line height', () => {
  it('gives every shipped bitmap font 1.0 so box-drawing chars connect', () => {
    for (const font of BBS_FONTS) expect(lineHeightFor(font)).toBe(1.0);
  });

  it('falls back to the default line height for an unknown font', () => {
    expect(lineHeightFor('Comic Sans MS')).toBe(1.0);
    expect(lineHeightFor('')).toBe(1.0);
  });
});

describe('the pre-login font cache', () => {
  it('round-trips a font through localStorage', () => {
    writeCachedFont('P0T-NOoDLE');
    expect(window.localStorage.getItem(FONT_CACHE_KEY)).toBe('P0T-NOoDLE');
    expect(readCachedFont()).toBe('P0T-NOoDLE');
  });

  it('reads null when this browser has never seen the board', () => {
    expect(readCachedFont()).toBeNull();
  });

  it('refuses to cache or return a font the board does not ship', () => {
    writeCachedFont('Comic Sans MS');
    expect(window.localStorage.getItem(FONT_CACHE_KEY)).toBeNull();
    window.localStorage.setItem(FONT_CACHE_KEY, 'Comic Sans MS');
    expect(readCachedFont()).toBeNull();
    expect(isBbsFont('Comic Sans MS')).toBe(false);
  });

  it('survives localStorage being unavailable instead of throwing', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readCachedFont()).toBeNull();
    expect(() => writeCachedFont(DEFAULT_BBS_FONT)).not.toThrow();
  });
});

describe('applying a font to a terminal', () => {
  it('sets family and line height and remembers the pick', async () => {
    const term = { options: {} as Record<string, any> };
    await applyFont(term, 'Topaz_a500');
    expect(term.options.fontFamily).toBe(fontFamilyFor('Topaz_a500'));
    expect(term.options.lineHeight).toBe(1.0);
    expect(readCachedFont()).toBe('Topaz_a500');
  });

  it('leaves the calibrated font size alone when no size is given', async () => {
    const term = { options: { fontSize: 11 } as Record<string, any> };
    await applyFont(term, 'Topaz_a500');
    expect(term.options.fontSize).toBe(11);
    await applyFont(term, 'Topaz_a500', 14);
    expect(term.options.fontSize).toBe(14);
  });
});

/**
 * "The font is correct after loading the site two times" (sysop,
 * 2026-09-02) - the cold-load race between the .ttf arriving and xterm
 * measuring the character cell.
 */
describe('the cold-load font race', () => {
  /** A terminal double that records every fontFamily write, which is what
   * xterm's OptionsService turns into CharSizeService.measure(). */
  function recordingTerm(initialFamily?: string) {
    const writes: string[] = [];
    const options: Record<string, any> = {};
    let family = initialFamily;
    Object.defineProperty(options, 'fontFamily', {
      enumerable: true,
      get: () => family,
      set: (v: string) => { family = v; writes.push(v); },
    });
    return { term: { options }, writes };
  }

  function fakeFontSet() {
    let resolveLoad!: () => void;
    const pending = new Promise<void>((r) => { resolveLoad = r; });
    const load = vi.fn(() => pending.then(() => []));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    return { load, arrive: resolveLoad };
  }

  afterEach(() => {
    // Leave the document as jsdom had it (no CSS Font Loading API).
    Reflect.deleteProperty(document as any, 'fonts');
  });

  it('a cold load renders in Topaz only once the font file arrives', async () => {
    const { load, arrive } = fakeFontSet();
    const { term, writes } = recordingTerm();
    const done = applyFont(term, DEFAULT_BBS_FONT);

    // The face has not arrived: nothing has been written to xterm yet, so
    // it cannot have measured the fallback and called it Topaz.
    await Promise.resolve();
    expect(load).toHaveBeenCalledWith(`12px "${DEFAULT_BBS_FONT}"`);
    expect(writes).toEqual([]);
    expect(term.options.fontFamily).toBeUndefined();

    arrive();
    await done;
    expect(term.options.fontFamily).toBe(fontFamilyFor(DEFAULT_BBS_FONT));
  });

  it('a warm load applies immediately', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => []) },
    });
    const { term } = recordingTerm();
    await applyFont(term, DEFAULT_BBS_FONT);
    expect(term.options.fontFamily).toBe(fontFamilyFor(DEFAULT_BBS_FONT));
  });

  it('re-measures when the family was already right but the face was not loaded', async () => {
    // The constructor already opened xterm in this exact family, so the
    // OptionsService setter would fire nothing and the fallback metrics
    // measured at open() would survive the whole session.
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => []) },
    });
    const family = fontFamilyFor(DEFAULT_BBS_FONT);
    const { term, writes } = recordingTerm(family);
    await applyFont(term, DEFAULT_BBS_FONT);
    // Nudged through the fallback and back - two option changes, hence two
    // CharSizeService.measure() runs, the last against the loaded face.
    expect(writes).toEqual([family, FALLBACK_FONT_STACK, family]);
    expect(term.options.fontFamily).toBe(family);
  });

  it('does not re-measure twice when the family genuinely changed', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => []) },
    });
    const { term, writes } = recordingTerm(fontFamilyFor('mosoul'));
    await applyFont(term, DEFAULT_BBS_FONT);
    // One write, one measure - no fallback nudge needed.
    expect(writes).toEqual([fontFamilyFor(DEFAULT_BBS_FONT)]);
  });

  it('applies without the CSS Font Loading API instead of hanging', async () => {
    Reflect.deleteProperty(document as any, 'fonts');
    const { term } = recordingTerm();
    await applyFont(term, DEFAULT_BBS_FONT);
    expect(term.options.fontFamily).toBe(fontFamilyFor(DEFAULT_BBS_FONT));
    await expect(waitForFontFace(DEFAULT_BBS_FONT)).resolves.toBeUndefined();
  });

  it('a later font request wins over an earlier one that resolves late', async () => {
    // The constructor's cached-font apply and the server's font-preference
    // apply overlap on every login. Their font faces resolve in whatever
    // order the network hands them over, and last-resolution-wins would
    // let the STALE cached font overwrite the server's answer.
    const faces = new Map<string, () => void>();
    const load = vi.fn((spec: string) =>
      new Promise<void>((resolve) => { faces.set(spec, resolve); }).then(() => []),
    );
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });

    const { term } = recordingTerm();
    const first = applyFont(term, 'mosoul');          // the cached font
    const second = applyFont(term, 'TopazPlus_a500'); // the server's answer

    // Resolve them in REVERSE order: the server's face arrives first, the
    // stale cached face second.
    faces.get('12px "TopazPlus_a500"')!();
    await second;
    faces.get('12px "mosoul"')!();
    await first;

    expect(term.options.fontFamily).toBe(fontFamilyFor('TopazPlus_a500'));
    expect(readCachedFont()).toBe('TopazPlus_a500');
  });

  it('forceRemeasure leaves an unset or fallback-only family alone', () => {
    const empty = { options: {} as Record<string, any> };
    forceRemeasure(empty);
    expect(empty.options.fontFamily).toBeUndefined();
    const fallback = { options: { fontFamily: FALLBACK_FONT_STACK } as Record<string, any> };
    forceRemeasure(fallback);
    expect(fallback.options.fontFamily).toBe(FALLBACK_FONT_STACK);
  });
});
