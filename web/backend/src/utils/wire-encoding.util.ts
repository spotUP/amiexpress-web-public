/**
 * The ONE place a JS string becomes bytes for a byte-transport caller.
 *
 * Until this module existed the string went to `TelnetConnection.write`, which
 * did `Buffer.from(data)` with no encoding argument (`server/telnet-server.ts`)
 * i.e. UTF-8, and to `SSHConnection.write`'s `this.stream.write(data)`
 * (`server/ssh-server.ts`), Node's UTF-8 default. Measured on this checkout:
 * `Screens/BBSTITLE.txt` is 13894 bytes on disk with 240 of them >= 0x80, and
 * left as 14134 - every high byte doubled, every art line one character wider
 * than the screen, for every terminal that is not UTF-8.
 *
 * THE LEVEL THIS FIX LIVES AT. The string is correct; the byte conversion is
 * not. Fixing it at the decoder (carry bytes through the whole MCI / wrap /
 * filter pipeline) is a rewrite of everything that touches a screen; fixing it
 * at the producer is 1832 call sites. One encoder at the transport is where
 * the mismatch actually is.
 *
 * A LEAF MODULE. It imports `iconv-lite`, two TYPES, and nothing else, so
 * `server/connection-emitter.ts` and any handler can import it with no cycle.
 * No `any` crosses its boundary.
 */
import * as iconv from "iconv-lite";
import type { BBSSession } from "../index";
import type { OutputAttributes } from "./output-pacing";

/** What the caller on the other end of the socket reads. */
export type WireCharset = "utf-8" | "iso-8859-1" | "cp437";

/** The two single-byte codecs; `utf-8` never reaches the encode step. */
export type SourceCharset = Exclude<WireCharset, "utf-8">;

/**
 * No negotiated answer: Latin-1.
 *
 * `detectEncoding` (`utils/amiga-text-decode.util.ts`) returns `iso-8859-1`
 * for everything that is not a `.ans` or SAUCE-stamped file, and RULES.md's
 * output convention forbids PC box-drawing in the BBS's own output, so Latin-1
 * round-trips this board's screens byte-for-byte. It is also what
 * `tests/server/eighty-col-choke-identity.test.ts` has been asserting since it
 * was written (its telnet baseline is `Buffer.from(str, 'latin1')`), against a
 * fake `connection.write` that never exercised the real conversion.
 */
export const DEFAULT_WIRE_CHARSET: WireCharset = "iso-8859-1";

/** The subset of a session this module reads. */
export type WireSession = Pick<BBSSession, "connectionType" | "unicodeCapable" | "wireCharset">;

/**
 * ONE TERMINAL PREDICATE, and no second list of terminal names.
 *
 * `classifyTerminalType` (`server/telnet-server.ts`) already computes
 * `unicodeCapable` from its modern / Amiga / C64 lists, the result is already
 * stored on the session and already read by every blessed door
 * (`doors/BBSApi.ts` -> `sdk/utils/blessed-helpers.ts`). `unicodeCapable` is
 * EXACTLY the question "does this caller read UTF-8", so the wire charset is
 * derived from it rather than from a second table that could disagree.
 *
 * Precedence: an explicit telnet CHARSET negotiation (RFC 2066) beats the
 * TTYPE classification, which beats the default. `unicodeCapable` is
 * `undefined` for a caller who negotiated no TTYPE, which correctly falls
 * through to Latin-1 - and for SSH until TP-12 fills it in, at which point SSH
 * inherits this same one predicate with no change here.
 */
export function resolveWireCharset(session: WireSession | null | undefined): WireCharset {
  if (session?.connectionType === "web") return "utf-8";
  if (session?.wireCharset) return session.wireCharset;
  if (session?.unicodeCapable === true) return "utf-8";
  return DEFAULT_WIRE_CHARSET;
}

/**
 * Characters a single-byte target charset cannot hold, mapped to the ASCII
 * forms RULES.md already mandates for BBS output ("Amiga ASCII only: _/\|-").
 *
 * Keyed by CODEPOINT and applied by a single forward scan - never a
 * module-level `/g` RegExp with `.test()`, whose `lastIndex` is shared mutable
 * state and which has already bitten this codebase once on an async-recursive
 * path (`feedback_async_recursive_regex`).
 */
function buildSubstitutions(): ReadonlyMap<number, string> {
  const map = new Map<number, string>();

  // U+2500-U+257F Box Drawing. Everything is a junction unless it is one of
  // the pure horizontal or pure vertical runs listed below.
  for (let cp = 0x2500; cp <= 0x257f; cp++) map.set(cp, "+");
  const horizontal = [
    0x2500, 0x2501, 0x2504, 0x2505, 0x2508, 0x2509, 0x254c, 0x254d, 0x2550,
    0x2574, 0x2576, 0x2578, 0x257a, 0x257c, 0x257e,
  ];
  const vertical = [
    0x2502, 0x2503, 0x2506, 0x2507, 0x250a, 0x250b, 0x254e, 0x254f, 0x2551,
    0x2575, 0x2577, 0x2579, 0x257b, 0x257d, 0x257f,
  ];
  for (const cp of horizontal) map.set(cp, "-");
  for (const cp of vertical) map.set(cp, "|");

  // U+2580-U+259F Block Elements. Solid blocks and halves read as fill; the
  // three shades keep their relative weight - light shade is nearly empty.
  for (let cp = 0x2580; cp <= 0x259f; cp++) map.set(cp, "#");
  map.set(0x2591, " "); // light shade
  map.set(0x2592, ":"); // medium shade
  // 0x2593 (dark shade) keeps the default "#".

  return map;
}

const SUBSTITUTIONS = buildSubstitutions();

/** Highest codepoint ISO-8859-1 can hold; above it nothing encodes. */
const LATIN1_MAX = 0xff;

/** iconv's answer for "I cannot represent this character". */
const UNMAPPABLE_BYTE = 0x3f;

/**
 * Memoised per-codepoint answer for CP437, which is a sparse map with no
 * arithmetic rule. ISO-8859-1 needs no table: the codepoint IS the byte.
 */
const cp437Encodable = new Map<number, boolean>();

function canEncode(codePoint: number, charset: SourceCharset): boolean {
  if (codePoint <= 0x7f) return true;
  if (charset === "iso-8859-1") return codePoint <= LATIN1_MAX;
  const known = cp437Encodable.get(codePoint);
  if (known !== undefined) return known;
  const bytes: Buffer = iconv.encode(String.fromCodePoint(codePoint), "cp437");
  const answer = !(bytes.length === 1 && bytes[0] === UNMAPPABLE_BYTE);
  cp437Encodable.set(codePoint, answer);
  return answer;
}

/**
 * Replace the characters `charset` cannot hold with their documented ASCII
 * forms. ONE forward scan; the string is returned UNCHANGED (same instance,
 * no allocation) when nothing was replaced, which is the overwhelming majority
 * of payloads - an all-ASCII prompt does one pass and allocates nothing.
 *
 * A character that is unmappable AND has no substitution is left alone: iconv
 * then writes `?` for it, which is the documented fallback and is visible to a
 * reader rather than silently dropped.
 */
export function substituteUnmappable(text: string, charset: SourceCharset): string {
  let out: string | null = null;
  let copiedUpTo = 0;
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) break;
    const width = codePoint > 0xffff ? 2 : 1;
    if (codePoint > 0x7f && !canEncode(codePoint, charset)) {
      const replacement = SUBSTITUTIONS.get(codePoint);
      if (replacement !== undefined) {
        if (out === null) out = "";
        out += text.slice(copiedUpTo, i) + replacement;
        copiedUpTo = i + width;
      }
    }
    i += width;
  }
  if (out === null) return text;
  return out + text.slice(copiedUpTo);
}

/**
 * The string UNCHANGED when the resolved charset is UTF-8 - today's behaviour
 * for web, for `/ws/terminal`, and for a telnet client that negotiated UTF-8 -
 * and a Buffer in that charset otherwise.
 *
 * The union return is load-bearing twice over. `TelnetConnection.write`
 * already does `Buffer.from(data)` for a string, so the UTF-8 case is a
 * literal no-op diff; and `WSTerminalConnection.write`
 * (`server/ws-terminal-server.ts`) sends a TEXT frame for a string and a
 * BINARY frame for a Buffer, so returning a Buffer there would change the
 * frame type its clients receive.
 *
 * Three cases, in this order:
 *
 * 1. wire charset is UTF-8 - return `text`.
 * 2. `attrs.sourceCharset === wireCharset` - `iconv.encode`, which reproduces
 *    the file's own bytes EXACTLY, because a single-byte codec is a total
 *    injective map: `encode(decode(b, S), S) === b`. This is the case the
 *    BBSTITLE pin measures and the case that makes a `.ans` reach a CP437
 *    caller as the bytes the file holds.
 * 3. otherwise - transcode, with the box-glyph substitution above. A `.ans`
 *    (CP437 source) to a Latin-1 caller, or any composed text with no source
 *    charset at all, becomes something the caller can actually read.
 */
export function encodeForWire(
  session: WireSession | null | undefined,
  text: string,
  attrs?: Readonly<OutputAttributes>,
): string | Buffer {
  const charset = resolveWireCharset(session);
  if (charset === "utf-8") return text;
  if (attrs?.sourceCharset === charset) return iconv.encode(text, charset);
  return iconv.encode(substituteUnmappable(text, charset), charset);
}
