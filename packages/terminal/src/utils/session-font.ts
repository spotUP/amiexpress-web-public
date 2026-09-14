/**
 * The session font - one owner.
 *
 * "Something broke the topaz font when the bbs loads, some other font is
 * used now" (sysop, 2026-09-02). The board font used to be applied in
 * exactly one place: AFTER `login-success` -> `get-font-preference` ->
 * `font-preference`. Everything before that - the connect banner, the
 * ANSI/graphics prompt, the login screen - rendered in whatever xterm was
 * constructed with (`XTERM_CONFIG.fontFamily`, mOsOul), and a RESTORED
 * session never asked for the preference at all, so it ran the whole
 * session in mOsOul.
 *
 * This module is the single source of truth for the font a BBS terminal
 * session runs in: the default, the CSS stack, the line height, the
 * client-side cache that covers the pre-login window, and the one function
 * that applies all of it to an xterm instance. No caller builds a font
 * stack or a line-height map of its own.
 *
 * Caches are two-tier: cookie (survives cross-domain, server-readable) and
 * localStorage (faster, JS-only). Both are written; read prefers
 * localStorage for speed, falls back to cookie for cold/private-browsing
 * visits.
 */

import { readCookieFont, writeCookieFont } from './session-cookie';

/**
 * The board's default font, identical to the backend default
 * (web/backend/src/server/preference-socket-handlers.ts and
 * web/backend/src/repositories/user-repository.ts both default to
 * 'TopazPlus_a1200'). A user who has never picked a font sees Topaz on
 * both sides of login.
 */
export const DEFAULT_BBS_FONT = 'TopazPlus_a1200';

/**
 * Teletext session mode face (T answer at the graphics prompt). TDAText,
 * OFL-1.1 (web/frontend/public/fonts/TDAText-OFL-LICENSE.txt).
 *
 * Deliberately NOT in BBS_FONTS: the mode is session state, not a
 * preference. Keeping it out of the allowlist means the pre-login cache
 * can never open the board in it, and the font picker never offers it -
 * so applyFont's cache write below is a no-op for it even without the
 * flag. The flag exists so that stays true if anyone ever lists it.
 */
/* TeletextUPR, not TDAText: the shipped face is TDAText with its lowercase
   a-ring repaired (it was a copy of a-dieresis) and renamed, because TDAText
   is a Reserved Font Name under the OFL. See
   web/frontend/public/fonts/TeletextUPR-OFL-LICENSE.txt. */
export const TELETEXT_FONT = 'TeletextUPR';

/**
 * Every face the board loads on connect, and the file each one comes from.
 *
 * DATA, and exported, because it was a list spelled out inside the terminal
 * component where nothing could check it against the fonts actually shipped.
 * The teletext face was renamed TDAText -> TeletextUPR and this list kept the
 * old spelling, so every connect fetched `/fonts/TDAText.woff2`, got a 404,
 * and a teletext session measured and drew in the fallback face for the rest
 * of its life (sysop's console, 2026-09-14).
 *
 * `preloaded-fonts-exist.test.ts` reads this and asks the filesystem, which
 * is the check that was missing.
 */
export const PRELOADED_FONTS: ReadonlyArray<{ family: string; file: string }> = [
  { family: 'TopazPlus_a1200', file: 'TopazPlus_a1200_v1.0.ttf' },
  { family: 'TopazPlus_a500', file: 'TopazPlus_a500_v1.0.ttf' },
  { family: 'Topaz_a1200', file: 'Topaz_a1200_v1.0.ttf' },
  { family: 'Topaz_a500', file: 'Topaz_a500_v1.0.ttf' },
  { family: 'mosoul', file: 'mOsOul_v1.0.ttf' },
  { family: 'PetMe64', file: 'PetMe64.ttf' },
  { family: TELETEXT_FONT, file: `${TELETEXT_FONT}.woff2` },
  // BBSGraphics carries U+2500-259F - every box border and block the Amiga
  // faces stop short of. Declared in a stylesheet only, the browser fetched it
  // the first time a glyph needed it, by which point the screen was already
  // laid out in the fallback's wider cell.
  { family: 'BBSGraphics', file: 'BBSGraphics.ttf' },
];


/**
 * How wide each face's cell is, as a fraction of the font size: the advance
 * of its glyphs over its em. A property of the shipped files, not a guess -
 * pinned against them in session-font-advance.test.ts.
 */
const ADVANCE_RATIOS: Record<string, number> = {
  'mosoul': 0.5,
  'MicroKnight': 0.5,
  'MicroKnightPlus': 0.5,
  'P0T-NOoDLE': 0.5,
  'Topaz_a500': 0.5,
  'Topaz_a1200': 0.5,
  'TopazPlus_a500': 0.5,
  'TopazPlus_a1200': 0.5,
  'PetMe64': 1.0,
  'TeletextUPR': 0.6,
};

/** How wide a TeletextUPR cell is: 600 units of advance over an em of 1000. */
export const TELETEXT_ADVANCE_RATIO = ADVANCE_RATIOS['TeletextUPR'];

/** The advance ratio of a BBS face. Every Amiga face the board ships is 0.5. */
export function advanceRatioFor(font: string): number {
  return ADVANCE_RATIOS[font] ?? 0.5;
}

/**
 * The largest size at or below `size` whose CELL is a whole CSS pixel.
 *
 * The terminal draws with xterm's DOM renderer, which lays a row out as
 * spans of text; a fractional cell width rounds per span, and the glyphs
 * that fill their cell edge to edge - a mosaic, an underscore, every Amiga
 * ASCII glyph drawn to meet its neighbour - show a one-pixel gap wherever
 * the rounding lands. Measured by screenshotting rows and counting runs
 * (dpr 2, sysop 2026-09-14): a 22.5px teletext cell breaks a 40-cell rule
 * into seven runs; a 24px cell gives one run of 1920 unbroken pixels. Eighty
 * underscores in Topaz at a 15px cell: one run of 2400.
 *
 * (The canvas renderer was worse and could not be fixed from here: its
 * atlas blits any glyph that comes from the face at `cellWidth - 1` device
 * pixels, whatever the size and whatever the font - 44 lit of a 45px cell -
 * and WebGL shares that atlas. U+2580-259F escaped it only because xterm
 * draws those itself, which is why block art looked fine while the artists'
 * underscores did not: "det ar liksom inte tillrackligt med plats, dom
 * overlappar". The board no longer loads it.)
 *
 * DOWN, never up: the caller's size is already the largest that fits.
 */
export function seamlessSize(size: number, font: string): number {
  const ratio = advanceRatioFor(font);
  const cell = Math.floor(size * ratio);
  return cell > 0 ? cell / ratio : size;
}

/** seamlessSize for the teletext face. */
export function seamlessTeletextSize(size: number): number {
  return seamlessSize(size, TELETEXT_FONT);
}

/**
 * Every font the BBS ships and the picker can select. Used to validate the
 * cached value: a stale or hand-edited localStorage entry must never be
 * able to render the board in a font that does not exist.
 */
export const BBS_FONTS = [
  'mosoul',
  'MicroKnight',
  'MicroKnightPlus',
  'P0T-NOoDLE',
  'Topaz_a500',
  'Topaz_a1200',
  'TopazPlus_a500',
  'TopazPlus_a1200',
] as const;

export type BbsFont = (typeof BBS_FONTS)[number];

/** localStorage key holding the last font this browser saw the board use. */
export const FONT_CACHE_KEY = 'bbs_font_preference';

/**
 * Amiga bitmap fonts render gapless at 1.0 - pipe / box-drawing chars are
 * designed to connect vertically across rows, and any value above 1.0
 * inserts a visible gap that breaks the ASCII art. The BBS catalog only
 * ships bitmap fonts, so every entry is 1.0 and an unknown font falls back
 * to 1.0 as well. This map exists once; it used to exist twice, inside the
 * `set-font` and `font-preference` handlers.
 */
const LINE_HEIGHTS: Record<string, number> = {
  'mosoul': 1.0,
  'MicroKnight': 1.0,
  'MicroKnightPlus': 1.0,
  'P0T-NOoDLE': 1.0,
  'Topaz_a500': 1.0,
  'Topaz_a1200': 1.0,
  'TopazPlus_a500': 1.0,
  'TopazPlus_a1200': 1.0,
};

/**
 * The CSS font stack for a BBS font: the bitmap face, the DOS graphics it
 * does not have, then the generic fallbacks.
 *
 * Every Amiga face this board ships stops at U+00FF - zero of the 128
 * box-drawing codepoints, zero of the 32 block elements - and CP437 art is
 * made of exactly those. They used to come from a table inside xterm's
 * canvas addon; BBSGraphics puts them in a FACE, drawn on the same 8x16 cell
 * at the same 0.5em advance, so the DOM renderer can draw a screen without
 * falling through to a font that does not tile.
 *
 * Per-character fallback is what makes this work: the browser takes each
 * codepoint from the first family that has it, so the board's own letters
 * still come from Topaz and only the graphics come from here.
 */
export function fontFamilyFor(font: string): string {
  return `${font}, BBSGraphics, "Courier New", monospace`;
}

/** The xterm line height for a BBS font. Unknown fonts get the safe 1.0. */
export function lineHeightFor(font: string): number {
  return LINE_HEIGHTS[font] ?? 1.0;
}

/** True when `font` is one of the fonts the board actually ships. */
export function isBbsFont(font: string | null | undefined): font is BbsFont {
  return typeof font === 'string' && (BBS_FONTS as readonly string[]).includes(font);
}

/**
 * The font this browser last saw the board use, or null when there is no
 * usable cached value. Only a known BBS font is returned.
 *
 * Tries localStorage first (faster, survives page reload), then the cookie
 * (server-readable, survives cross-domain, covers private-browsing windows
 * where localStorage is unavailable).
 */
export function readCachedFont(): BbsFont | null {
  try {
    const cached = window.localStorage.getItem(FONT_CACHE_KEY);
    if (isBbsFont(cached)) return cached;
  } catch {
    /* localStorage unavailable -- fall through to cookie */
  }
  try {
    const fromCookie = readCookieFont();
    if (isBbsFont(fromCookie)) return fromCookie;
  } catch {
    /* cookie unavailable */
  }
  return null;
}

/** Remember the font for the next connect's pre-login window. */
export function writeCachedFont(font: string): void {
  if (!isBbsFont(font)) return;
  try {
    window.localStorage.setItem(FONT_CACHE_KEY, font);
  } catch {
    /* storage unavailable */
  }
  writeCookieFont(font);
}

/** The fallback half of every BBS font stack, and the family the forced
 * re-measure nudges through. */
export const FALLBACK_FONT_STACK = '"Courier New", monospace';

/**
 * The minimum of xterm's Terminal this module writes to. Declared
 * structurally so the applier can be unit-tested without an xterm
 * instance (jsdom has no canvas).
 */
export interface FontTarget {
  options: {
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
  };
}

/**
 * Wait for the browser to actually have the bitmap face.
 *
 * "The font is correct after loading the site two times" (sysop,
 * 2026-09-02): on a cold load the .ttf has not arrived when the family is
 * handed to xterm, xterm measures the FALLBACK ("Courier New") and never
 * re-measures when the file lands - so the board renders in Courier
 * metrics until something else forces a measure. On a warm load the file
 * comes from cache and the same code looks fine. Every font the board
 * ships has a CSS @font-face rule (web/frontend/src/index.css), so
 * `document.fonts.load` finds and fetches the face; a resolved promise on
 * a warm load costs a microtask.
 *
 * Resolves immediately where the CSS Font Loading API is absent (jsdom,
 * old browsers) - the fallback stack still renders something.
 */
export async function waitForFontFace(font: string): Promise<void> {
  const fonts: FontFaceSet | undefined =
    typeof document === 'undefined' ? undefined : (document as Document).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  try {
    await fonts.load(`12px "${font}"`);
  } catch {
    /* no such face - the fallback stack covers it */
  }
}

/**
 * Force xterm to re-measure the character cell.
 *
 * xterm's OptionsService setter fires `onOptionChange` ONLY when the value
 * actually changes (OptionsService.ts:132), and the re-measure hangs off
 * exactly that event: `CharSizeService` subscribes with
 * `onMultipleOptionChange(['fontFamily', 'fontSize'], () => this.measure())`
 * (CharSizeService.ts:34), and `RenderService` turns the resulting
 * `onCharSizeChange` into `handleCharSizeChanged()` (RenderService.ts:72).
 * So writing the SAME family back after the face finally loaded is a
 * no-op and the stale fallback metrics survive. Nudging the family to the
 * fallback and straight back fires the event twice; both writes are
 * synchronous, so the browser never paints the intermediate value.
 */
export function forceRemeasure(term: FontTarget): void {
  const family = term.options.fontFamily;
  if (!family || family === FALLBACK_FONT_STACK) return;
  term.options.fontFamily = FALLBACK_FONT_STACK;
  term.options.fontFamily = family;
}

/**
 * Per-terminal request counter for `applyFont`. Keyed by the terminal so
 * two surfaces on one page cannot cancel each other's fonts; weak so a
 * disposed terminal does not keep an entry alive.
 */
const applyGenerations = new WeakMap<FontTarget, number>();

/**
 * Apply a BBS font to a terminal and remember it. The one place that
 * writes `options.fontFamily` / `options.lineHeight` for the session font.
 *
 * Awaits the face before touching xterm (see `waitForFontFace`) and forces
 * a re-measure when the family string did not change - the cold-load case
 * where xterm already holds the right name and the wrong metrics.
 *
 * `fontSize` is the CALIBRATED size (mobile measures its own); omit it to
 * leave the terminal's current size alone rather than forcing the desktop
 * default.
 *
 * `cacheFont` is false for session modes (teletext): the face belongs to
 * this session only and must not become the next connect's pre-login font.
 */
export async function applyFont(term: FontTarget, font: string, fontSize?: number, cacheFont = true): Promise<void> {
  const generation = (applyGenerations.get(term) ?? 0) + 1;
  applyGenerations.set(term, generation);
  await waitForFontFace(font);
  // A newer applyFont for this terminal started while this one was waiting
  // for its face, so this call's font is stale. Without this guard the
  // race is last-RESOLUTION-wins rather than last-REQUEST-wins: the
  // constructor's cached-font apply and the server's font-preference apply
  // overlap on every login, and a slow-loading cached font would overwrite
  // the answer the server just gave - in the terminal AND in the cache,
  // which would then poison the next connect's pre-login window too.
  if (applyGenerations.get(term) !== generation) return;
  const family = fontFamilyFor(font);
  const familyChanged = term.options.fontFamily !== family;
  term.options.fontFamily = family;
  // Through seamlessSize: this is the one place a face and a size meet, so
  // it is where the cell is made whole (a fractional cell gaps every glyph
  // that fills its cell - see seamlessSize).
  if (typeof fontSize === 'number') term.options.fontSize = seamlessSize(fontSize, font);
  term.options.lineHeight = lineHeightFor(font);
  // A changed family already fired the measure; an unchanged one did not.
  if (!familyChanged) forceRemeasure(term);
  if (cacheFont) writeCachedFont(font);
}
