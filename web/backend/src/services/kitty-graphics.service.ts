/**
 * KITTY GRAPHICS FOR BYTE CALLERS: WHO IS ASKED, WHO HAS IT, WHERE IT GOES.
 *
 * The one owner of the session's kitty state (`kittyProbeSent`,
 * `kittyGraphics`, `kittyReplyPending` on BBSSession). The encoder is
 * `utils/kitty-graphics.util.ts`, ported from UP-Term's kittyout.c.
 *
 * DETECTION IS THE TERMINAL'S ANSWER, NEVER A NAME. A TTYPE string says which
 * program is on the other end, not whether this build of it draws pictures
 * (dc telnet gained kitty graphics in a release; an old copy reports the same
 * name). So the board asks, the way UP-Term's own tools do (kout_query), and
 * believes only `ESC _ G i=31 ; OK ESC \`.
 *
 * WHO IS ASKED: a telnet or SSH caller whose terminal answered TTYPE with a
 * non-C64 type. A caller that negotiates no terminal type (a C64 on a WiFi
 * modem) is never asked: the APC would print as PETSCII garbage there. The web
 * terminal is never asked: it is xterm.js, which drops APC strings.
 */

import type { BBSSession } from '../index';
import { sessionWantsPetscii } from '../utils/petscii-session-model';
import {
  KITTY_PROBE,
  encodeKittyPixels,
  encodeKittyPng,
  kittyReplyIsOk,
  splitKittyReplies,
  type KittyImageOptions,
} from '../utils/kitty-graphics.util';

type KittySession = Pick<
  BBSSession,
  | 'connectionType'
  | 'terminalType'
  | 'petsciiMode'
  | 'ansiMode'
  | 'kittyGraphics'
  | 'kittyProbeSent'
  | 'kittyReplyPending'
>;

/**
 * Send the kitty query to a caller whose terminal just named itself.
 * Once per connection. True when the query went out.
 */
export function startKittyProbe(
  session: KittySession | null | undefined,
  report: { readonly isC64: boolean },
  write: (bytes: string) => void,
): boolean {
  if (!session || session.kittyProbeSent) return false;
  if (session.connectionType !== 'telnet' && session.connectionType !== 'ssh') return false;
  if (report.isC64 || sessionWantsPetscii(session)) return false;
  session.kittyProbeSent = true;
  write(KITTY_PROBE);
  return true;
}

/**
 * Take kitty replies out of one chunk of a caller's input and return the
 * rest. An OK to the query marks the session as kitty-capable. Only callers
 * that were asked are filtered: for everyone else this is identity.
 */
export function takeKittyReplies(session: KittySession | null | undefined, input: string): string {
  if (!session?.kittyProbeSent) return input;
  const split = splitKittyReplies(session.kittyReplyPending ?? '', input);
  session.kittyReplyPending = split.pending;
  for (const reply of split.replies) {
    if (kittyReplyIsOk(reply)) session.kittyGraphics = true;
  }
  return split.text;
}

/**
 * Whether a picture sent now will be drawn: the terminal said OK, the
 * caller still reads ANSI (an M-toggled plain-text caller is sent no escape
 * sequences, utils/ansi.util.ts forCaller), and the session is not PETSCII.
 */
export function sessionHasKittyGraphics(session: KittySession | null | undefined): boolean {
  if (!session || session.kittyGraphics !== true) return false;
  if (session.ansiMode === false) return false;
  return !sessionWantsPetscii(session);
}

/** A picture to send: a PNG file's bytes, or raw RGB / RGBA pixels. */
export type KittyImage =
  | { readonly png: Uint8Array }
  | {
      readonly pixels: Uint8Array;
      readonly width: number;
      readonly height: number;
      readonly bpp: 3 | 4;
    };

export interface SendKittyImageOptions extends KittyImageOptions {
  /** What a caller without kitty graphics reads instead (ANSI text). */
  readonly fallback?: string;
}

/** The APC string for a picture, replies off (q=2: nothing comes back to filter). */
export function encodeKittyImage(image: KittyImage, opts?: KittyImageOptions): string | null {
  const o: KittyImageOptions = { quiet: 2, ...opts };
  return 'png' in image
    ? encodeKittyPng(image.png, o)
    : encodeKittyPixels(image.pixels, image.width, image.height, image.bpp, o);
}

/**
 * Show a picture to a kitty-capable caller, or the fallback text to anyone
 * else. `emitRaw` must reach the wire WITHOUT prose wrapping: a wrap inserts
 * CR LF inside the base64 and the terminal drops the picture. True when the
 * picture was sent.
 */
export function sendKittyImage(
  session: KittySession | null | undefined,
  image: KittyImage,
  opts: SendKittyImageOptions,
  emitRaw: (data: string) => void,
  emitText: (text: string) => void,
): boolean {
  const { fallback, ...keys } = opts;
  const apc = sessionHasKittyGraphics(session) ? encodeKittyImage(image, keys) : null;
  if (apc !== null) {
    emitRaw(apc);
    return true;
  }
  if (fallback) emitText(fallback);
  return false;
}
