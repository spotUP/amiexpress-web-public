/**
 * MCI tokenizer — 1:1 port of express.e processMci / processMciCmd
 * (express.e:5258-5410, 5769-5802).
 *
 * AmiExpress's MCI parser is a single-pass scanner, NOT a per-code
 * regex match. The differences matter for real screen files in the
 * wild. Concretely, given input like `~N.` (no `|` terminator):
 *
 *   - Express.e: scan for `~`, advance past it, eat optional 1-3
 *     digit width prefix, then read until the next space OR `|`. The
 *     extracted cmd is "N." which fails the strict StrCmp("N") check
 *     → no substitution. The `~` IS consumed; the rest ("N.") emits
 *     as plain text. Visible output: "N."
 *
 *   - Our previous regex (`~(\d{0,3})N\|`): requires a literal `|`.
 *     For `~N.` no match → entire `~N.` left literal in output.
 *     Visible output: "~N."
 *
 * Neither produces the username — the screen file author wrote the
 * code wrong. But we should at least match express.e so downstream
 * MCI behaviour is predictable. This tokenizer reproduces the
 * express.e flow exactly:
 *
 *   1. Walk the input. On every `~`:
 *      a. Advance pos by 1 (consume the `~`).
 *      b. Eat up to 3 leading digits as a width prefix.
 *      c. Find the smaller of (next space, next terminator, end).
 *      d. The substring [pos, terminator) is the cmd code.
 *      e. Look up the cmd in the dispatch map. If matched, advance
 *         pos past the cmd (and past the terminator if it was `|`),
 *         emit the value (truncated to the width).
 *      f. If no match, do NOT advance past the cmd — only the `~` is
 *         eaten. Subsequent text emits as-is (matches express.e fall-
 *         through behaviour at lines 5290-5404).
 *
 * Width prefix semantics (express.e:5288): width = `Val(num)`. If
 * `num` is empty, width = -1 (no truncation). If positive, the value
 * is truncated to that many characters via `aePuts2(str, maxLen)`
 * (express.e MiscFuncs / aePuts2). We mirror via `String.substring`.
 *
 * Terminator: defaults to `|` but `~D<char>` codes can switch it
 * mid-stream (express.e:5651). The current implementation in
 * screen.handler.ts strips `~D<char>` before the tokenizer runs and
 * captures the resulting terminator separately; we accept it here as
 * a parameter so the tokenizer is stateless.
 *
 * What this util does NOT cover yet (handled by callers):
 *   - `~XC_<cmd>||` (execute command queue) — caller-side regex.
 *   - `~XI<doorpath>` (silent XIM door launch) — caller-side regex.
 *   - `~CL.` / `~CD.` / `~ML.` / `~MD.` (multi-line list builders)
 *     — caller pre-substitutes the rendered list.
 *   - `~D<char>` (terminator change) — caller strips, sets terminator.
 *
 * That split keeps this tokenizer pure: input string + dispatch map +
 * terminator → output string. The big-feature MCI codes already match
 * express.e's flow well enough on their own; the user-info / system-
 * info codes (~N, ~UL, ~TC, ~RN, …) are the ones whose regex-based
 * behaviour diverged.
 */

export type MciHandler = (width: number) => string;

export interface MciDispatchMap {
  /**
   * Map from MCI command code (uppercase, no `~` or width digits) to a
   * handler returning the substitution text. The handler receives the
   * already-parsed width: -1 = "no truncation" (express.e default),
   * positive = truncate to N chars. The handler owns truncation
   * semantics so it can choose padding / right-align if needed
   * (express.e mostly truncates via aePuts2).
   */
  [code: string]: MciHandler;
}

/**
 * Apply width truncation matching express.e aePuts2 semantics:
 * positive width truncates to that many chars; -1 = no limit.
 */
export function applyMciWidth(value: string, width: number): string {
  return width > 0 ? value.substring(0, width) : value;
}

/**
 * Tokenize an MCI string and replace recognised codes with their
 * substitution values. Unrecognised codes follow express.e fall-
 * through behaviour: the leading `~` is consumed, the rest of the
 * supposed-code emits as plain text.
 *
 * @param input    the raw screen / message text containing MCI codes
 * @param dispatch map from cmd code (uppercase) to handler
 * @param terminator MCI terminator character; defaults to `|`. Must
 *                   be a single character (express.e uses one byte).
 * @returns the rendered string with MCI codes substituted
 */
export function processMci(
  input: string,
  dispatch: MciDispatchMap,
  terminator: string = '|',
): string {
  if (!input || input.length === 0) return input ?? '';
  const term = terminator.length > 0 ? terminator[0] : '|';

  let out = '';
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const tildePos = input.indexOf('~', pos);
    if (tildePos < 0) {
      // No more MCI markers — emit the tail as-is.
      out += input.slice(pos);
      break;
    }

    // Emit text before the `~`.
    out += input.slice(pos, tildePos);
    pos = tildePos + 1; // Consume the `~`.

    // Eat optional 1-3 digit width prefix (express.e:5272-5288).
    let widthDigits = '';
    while (
      widthDigits.length < 3 &&
      pos < len &&
      input.charCodeAt(pos) >= 0x30 &&
      input.charCodeAt(pos) <= 0x39
    ) {
      widthDigits += input[pos];
      pos++;
    }
    const width = widthDigits.length > 0 ? parseInt(widthDigits, 10) : -1;

    // Find the smaller of (next space, next terminator, end) past pos.
    // Express.e:5278-5285 — `nval` is next space, `maxLen` is next
    // terminator; cmd extends from pos to whichever comes first. If
    // the terminator wins, `t = 1` so the consumer also skips it.
    let nextSpace = input.indexOf(' ', pos);
    if (nextSpace < 0) nextSpace = len;
    let nextTerm = input.indexOf(term, pos);
    if (nextTerm < 0) nextTerm = len;
    let cmdEnd: number;
    let consumedTerminator: boolean;
    if (nextSpace < nextTerm) {
      cmdEnd = nextSpace;
      consumedTerminator = false;
    } else {
      cmdEnd = nextTerm;
      consumedTerminator = nextTerm < len; // true only if a real terminator was found
    }

    const cmd = input.slice(pos, cmdEnd).toUpperCase();
    const handler = cmd.length > 0 ? dispatch[cmd] : undefined;

    if (handler) {
      // Match. Advance past the cmd (and the terminator if present).
      pos = cmdEnd + (consumedTerminator ? 1 : 0);
      try {
        out += handler(width);
      } catch (err) {
        // A failing handler shouldn't tank the whole render. Emit
        // nothing for this code (matches express.e — handler errors
        // would silently corrupt buffers, but we'd rather drop).
      }
    } else {
      // No match — re-emit the `~` and any width digits we consumed
      // so downstream MCI handlers (regexes for ~XC_/~XI/~CR_/color
      // codes etc.) can still see the original sequence intact. This
      // is a deliberate divergence from express.e's strict fall-
      // through (which would consume the `~`): our handler pipeline
      // is split across multiple stages, and a strict tokenizer here
      // would eat codes belonging to later stages. The trade-off is
      // that genuinely-unknown codes like `~N.` remain literal in
      // output rather than emitting `N.` per express.e — once all
      // MCI handlers are unified into a single dispatch map, switch
      // back to strict fall-through (consume `~`, emit cmd as text).
      out += '~' + widthDigits;
      // pos stays at first char after the `~` + digits, so the next
      // iteration treats the cmd content as plain text.
    }
  }

  return out;
}
