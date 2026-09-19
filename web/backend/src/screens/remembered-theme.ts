/**
 * THE THEME A RETURNING CALLER IS WEARING, BEFORE THE BOARD KNOWS WHO THEY ARE.
 *
 * The title screen is drawn in the pre-login sequence (command.handler.ts's
 * `displayScreen(socket, session, 'BBSTITLE')`), and at that point the session
 * has no user: `resolveCallerTheme` is asked about nobody, falls back to the
 * board default, and the caller's own theme reaches the screen only from the
 * first screen AFTER login. The sysop wore h7 and got tango's title:
 * "i switched to h7's theme on the live bbs, most screens show old ones" and
 * then "we save cookies so it should remember the theme" (2026-09-18).
 *
 * So the browser keeps one, the way it already keeps the caller's font and
 * modem speed (`packages/terminal/src/utils/session-cookie.ts`), and the
 * board reads it off the socket handshake at connect.
 *
 * IT IS A PREFERENCE, NOT A CREDENTIAL. A cookie says what a browser last
 * wore; it proves nothing about who is holding it. So the slug is handed to
 * `resolveCallerTheme` as the caller's WANT, with no username beside it -
 * which is exactly the judge's rule for an unidentified caller: a `live`
 * theme is for everybody, a draft is for its owner, and an owner is somebody
 * the board has not identified yet. A draft named in a cookie is refused the
 * same as one named by a caller who does not own it.
 */
import { cookieValue } from '../server/beeb-rom-access';

/** The cookie the terminal writes after a login tells it which theme it wore. */
export const SCREEN_THEME_COOKIE = 'bbs_screen_theme';

/** A slug shape, before the registry is asked: a name, not a path. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * The slug a caller's browser remembers, or null.
 *
 * Only the shape is checked here. Whether it may be WORN is
 * `resolveCallerTheme`'s question, and asking it twice is how the two answers
 * would drift.
 */
export function rememberedTheme(cookieHeader: string | undefined): string | null {
  const raw = cookieValue(cookieHeader, SCREEN_THEME_COOKIE)?.trim().toLowerCase();
  if (!raw || !SLUG.test(raw)) return null;
  return raw;
}
