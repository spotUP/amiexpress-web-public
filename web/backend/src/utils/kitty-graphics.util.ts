/**
 * KITTY GRAPHICS PROTOCOL: THE BOARD'S ENCODER AND REPLY READER.
 *
 * kitty's graphics protocol carries a picture in APC strings:
 * `ESC _ G <keys> ; <base64> ESC \`. A terminal that implements it (kitty,
 * WezTerm, Ghostty, UP-Term's vtcon console handler, dc telnet) shows the
 * picture on the cells; every other xterm-style terminal ignores an APC.
 *
 * Ported from UP-Term's encoder, `vtcon-*\/pic/kittyout.c` (kout_pixels,
 * kout_png, kout_query, kout_query_ok): the same key order, the same
 * 3072-byte raw chunks (4096 base64 characters, kitty's chunk ceiling) with
 * `m=1` on every chunk but the last, and the same detection query. Keeping
 * the bytes identical means UP-Term's own engine tests describe what this
 * board sends.
 *
 * Pure: strings in, strings out. Where the bytes go, and who is asked, is
 * `services/kitty-graphics.service.ts`.
 */

/** The image id the detection query uses (kout_query). */
export const KITTY_QUERY_ID = 31;

/**
 * The detection query: query action (a=q) on a 1x1 RGB pixel sent directly.
 * A terminal with kitty graphics answers `ESC _ G i=31 ; OK ESC \`; one
 * without it says nothing.
 */
export const KITTY_QUERY = `\x1b_Gi=${KITTY_QUERY_ID},s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\`;

/**
 * The query as the board sends it at connect: the query, then CR and erase
 * to end of line. A terminal that does not parse APC and prints the string
 * as text has it wiped before the first screen draws; for every other
 * terminal the cursor is already at column 0 of a blank line, so the tail
 * changes nothing.
 */
export const KITTY_PROBE = `${KITTY_QUERY}\r\x1b[K`;

/** 3072 raw bytes are 4096 base64 characters: kitty's per-chunk ceiling. */
const RAW_CHUNK = 3072;

/** The display keys every transmit takes (kout_opts). */
export interface KittyImageOptions {
  /** c=: scale to this many cells wide; 0 or absent = natural size. */
  readonly cols?: number;
  /** r=: scale to this many cells high; 0 or absent = natural size. */
  readonly rows?: number;
  /** q=: 1 hides OK replies, 2 hides every reply. */
  readonly quiet?: 0 | 1 | 2;
  /** i=: an image id, so a later delete can name it. */
  readonly id?: number;
}

function commonKeys(o: KittyImageOptions | undefined): string {
  let k = '';
  if (o?.id !== undefined && o.id > 0) k += `,i=${Math.floor(o.id)}`;
  if (o?.cols !== undefined && o.cols > 0) k += `,c=${Math.floor(o.cols)}`;
  if (o?.rows !== undefined && o.rows > 0) k += `,r=${Math.floor(o.rows)}`;
  if (o?.quiet !== undefined && o.quiet > 0) k += `,q=${o.quiet}`;
  return k;
}

/** The payload in APC chunks; `keys` is the first chunk's key list without m=. */
function sendChunks(keys: string, data: Uint8Array): string {
  let out = '';
  let off = 0;
  let first = true;
  do {
    const take = Math.min(RAW_CHUNK, data.length - off);
    const more = off + take < data.length;
    out += `\x1b_G${first ? `${keys},` : ''}m=${more ? 1 : 0};`;
    out += Buffer.from(data.subarray(off, off + take)).toString('base64');
    out += '\x1b\\';
    off += take;
    first = false;
  } while (off < data.length);
  return out;
}

/**
 * Raw pixels at the cursor: bpp 3 is f=24 (RGB), bpp 4 is f=32 (RGBA).
 * Null for a size that does not match the buffer (kout_pixels returns 0).
 */
export function encodeKittyPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  bpp: 3 | 4,
  opts?: KittyImageOptions,
): string | null {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * bpp) return null;
  const keys = `a=T,f=${bpp === 3 ? 24 : 32},s=${width},v=${height}${commonKeys(opts)}`;
  return sendChunks(keys, pixels);
}

/** A PNG file's bytes as they are (f=100), at the cursor. Null for no bytes. */
export function encodeKittyPng(png: Uint8Array, opts?: KittyImageOptions): string | null {
  if (png.length === 0) return null;
  return sendChunks(`a=T,f=100${commonKeys(opts)}`, png);
}

/** Delete every placement and free the image data (a=d, d=A). */
export const KITTY_DELETE_ALL = '\x1b_Ga=d,d=A,q=2\x1b\\';

/** True when an APC reply body (`i=31;OK`) is the OK answer to image `id`. */
export function kittyReplyIsOk(reply: string, id: number = KITTY_QUERY_ID): boolean {
  const semi = reply.indexOf(';');
  if (semi < 0 || reply.slice(semi + 1) !== 'OK') return false;
  return reply
    .slice(0, semi)
    .split(',')
    .some((kv) => kv === `i=${id}`);
}

/** The longest reply held across chunks (kitty's error replies are well under this). */
export const KITTY_REPLY_MAX = 512;

/** What `splitKittyReplies` found in one input chunk. */
export interface KittyReplySplit {
  /** The caller's input with every kitty reply taken out. */
  readonly text: string;
  /** Each reply's body: the bytes between `ESC _ G` and `ESC \`. */
  readonly replies: readonly string[];
  /** An unterminated reply at the end of the chunk, to prepend to the next one. */
  readonly pending: string;
}

/**
 * Take kitty's replies (`ESC _ G ... ESC \`) out of a caller's input.
 *
 * A reply is the terminal talking to the board, never a keypress, so no
 * prompt, editor or door may see it. A reply cut by a packet boundary is
 * returned as `pending` and finished by the next chunk. A lone trailing ESC is
 * NOT held: it is the ESC key far more often than half a reply, and doors
 * read ESC.
 */
export function splitKittyReplies(pending: string, input: string): KittyReplySplit {
  const s = pending + input;
  const replies: string[] = [];
  let text = '';
  let i = 0;
  for (;;) {
    const start = s.indexOf('\x1b_G', i);
    if (start < 0) {
      text += s.slice(i);
      return { text, replies, pending: '' };
    }
    text += s.slice(i, start);
    const end = s.indexOf('\x1b\\', start + 3);
    if (end < 0) {
      // A reply is a few dozen bytes; an "unterminated reply" longer than
      // this is not one, and holding it would swallow the caller's input.
      const rest = s.slice(start);
      if (rest.length > KITTY_REPLY_MAX) return { text: text + rest, replies, pending: '' };
      return { text, replies, pending: rest };
    }
    replies.push(s.slice(start + 3, end));
    i = end + 2;
  }
}
