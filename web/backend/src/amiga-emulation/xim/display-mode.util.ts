/**
 * What KIND of screen a caller has, in one word.
 *
 * The sizes have had an authority for a while (screen-width.util.ts), and
 * for a long time that was enough: every caller's screen was the same kind
 * of screen in one of two widths. It is not any more. A PETSCII caller's
 * bytes are transduced on the way out, a teletext caller's terminal draws
 * DECDHL headlines in a teletext face, and a door that wants to use either
 * has to be able to ask which it is talking to - "forty columns" is true of
 * a C64 and of a teletext screen alike, and answering only that is how a
 * teletext escape ends up in a Commodore byte stream.
 *
 * Read by the XIM command AEW_DISPLAYMODE, and by anything else that has to
 * branch on the kind rather than the width, so the answer cannot drift the
 * way a second copy of the question would.
 */
export type DisplayMode = 'ansi' | 'petscii' | 'teletext' | 'rip';

export interface DisplayModeSource {
  petsciiMode?: boolean;
  texttvMode?: boolean;
  ripMode?: boolean;
}

/**
 * The order matters and follows applyGraphicsAnswer (pre-login.ts): a
 * session carries one mode, and where two flags somehow disagree the one
 * that transduces the bytes wins, because that is the one a door must not
 * write escapes into.
 */
export function displayModeOf(session: DisplayModeSource | null | undefined): DisplayMode {
  if (session?.petsciiMode === true) return 'petscii';
  if (session?.texttvMode === true) return 'teletext';
  if (session?.ripMode === true) return 'rip';
  return 'ansi';
}
