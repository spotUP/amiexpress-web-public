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

/** The CSS font stack for a BBS font: the bitmap face, then fallbacks. */
export function fontFamilyFor(font: string): string {
  return `${font}, "Courier New", monospace`;
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
 */
export async function applyFont(term: FontTarget, font: string, fontSize?: number): Promise<void> {
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
  if (typeof fontSize === 'number') term.options.fontSize = fontSize;
  term.options.lineHeight = lineHeightFor(font);
  // A changed family already fired the measure; an unchanged one did not.
  if (!familyChanged) forceRemeasure(term);
  writeCachedFont(font);
}
