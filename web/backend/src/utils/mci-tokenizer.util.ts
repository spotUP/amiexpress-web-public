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
 *     -> no substitution. The `~` IS consumed; the rest ("N.") emits
 *     as plain text. Visible output: "N."
 *
 *   - Our previous regex (`~(\d{0,3})N\|`): requires a literal `|`.
 *     For `~N.` no match -> entire `~N.` left literal in output.
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
 *      f. If exact match fails, try the prefix dispatch (e.g. `~x10|`
 *         matches prefix `X` with suffix `"10"`; express.e:5478-5495
 *         StrCmp(cmd,'x',1) form).
 *      g. If still no match, fall-through: in soft mode (default), the
 *         `~` and width digits are re-emitted so downstream regex
 *         stages can still see the original sequence intact. In strict
 *         mode (`softFallThrough: false`), the `~` is consumed and the
 *         cmd content emits as plain text — full express.e parity.
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
 *   - `~CC_`/`~SS_`/`~SR_`/`~SX_` inline-mode codes — handled by the
 *     inline-mode pass after the tokenizer (rely on soft fall-through).
 *
 * That split keeps this tokenizer pure: input string + dispatch map +
 * terminator -> output string. The big-feature MCI codes already match
 * express.e's flow well enough on their own; the user-info / system-
 * info codes (~N, ~UL, ~TC, ~RN, …) are the ones whose regex-based
 * behaviour diverged.
 */

/**
 * Handler for an exact-match MCI code. Receives the parsed width (-1
 * if no width prefix). Return `undefined` to signal "no match" — the
 * tokenizer treats this identically to a missing dispatch entry and
 * falls through to the prefix dispatch / fall-through stage. Used by
 * `~SP` / `~CR` which only match when no width prefix is present
 * (express.e:5455 / 5462 — `(maxLen=-1) AND (StrCmp(cmd,'SP'))`).
 */
export type MciHandler = (width: number) => string | undefined;

/**
 * Handler for a prefix-match MCI code. The cmd starts with the
 * dispatch key; everything after is `suffix` (in the ORIGINAL case
 * from the source — not uppercased). Receives the same width-prefix
 * value as `MciHandler`. Return `undefined` for the same fall-through
 * semantics. Models express.e's `StrCmp(cmd,'x',1)` family
 * (express.e:5478-5495, 5496-5562 SS_/SX_/SR_/CC_).
 */
export type MciPrefixHandler = (suffix: string, width: number) => string | undefined;

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

export interface MciPrefixDispatchMap {
  /**
   * Map from uppercase prefix to handler. Longest prefix wins on
   * ambiguous matches. The cmd is uppercased for prefix matching, but
   * the suffix passed to the handler is sliced from the ORIGINAL cmd
   * so file paths / case-sensitive args round-trip intact.
   */
  [prefix: string]: MciPrefixHandler;
}

export interface MciDispatchConfig {
  dispatch: MciDispatchMap;
  prefixDispatch?: MciPrefixDispatchMap;
  /**
   * When `true` (default), unrecognised codes have the `~` and width
   * digits re-emitted into the output so downstream regex stages can
   * still see the original sequence. When `false`, the tokenizer
   * matches express.e exactly: `~` is consumed, cmd content emits as
   * plain text, no re-emit. Switch to `false` once every MCI code is
   * dispatched in-band — until then, leaving any out-of-band regex
   * stage relying on the `~` will silently break under strict mode.
   */
  softFallThrough?: boolean;
  /**
   * When `true`, dispatch keys are matched byte-exact against the cmd
   * (express.e `StrCmp` behaviour — lowercase `c0..c7`/`b0..b7`/`f`/
   * `w`/`x`/`y`/`q`/`h`/`n1..n9` and uppercase `N`/`UL`/`AK`/`SP`/etc
   * are all distinct). When `false` (default), cmd is uppercased
   * before dispatch lookup so dispatch keys can use a single case
   * regardless of how the screen file wrote them — useful as
   * "author-typo defence" but a divergence from express.e. Real
   * Amiga screens already use express.e-exact case, so flipping
   * this on is safe; it only changes behaviour for typo'd code
   * variants that would have failed on Amiga anyway.
   */
  caseSensitive?: boolean;
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
 * @param input        the raw screen / message text containing MCI codes
 * @param dispatchOrConfig either a flat dispatch map (legacy) or an
 *                     `MciDispatchConfig` with prefix dispatch / fall-
 *                     through options
 * @param terminator   MCI terminator character; defaults to `|`. Must
 *                     be a single character (express.e uses one byte).
 * @returns the rendered string with MCI codes substituted
 */
export function processMci(
  input: string,
  dispatchOrConfig: MciDispatchMap | MciDispatchConfig,
  terminator: string = '|',
): string {
  if (!input || input.length === 0) return input ?? '';
  const term = terminator.length > 0 ? terminator[0] : '|';

  const config: MciDispatchConfig = isDispatchConfig(dispatchOrConfig)
    ? dispatchOrConfig
    : { dispatch: dispatchOrConfig };
  const dispatch = config.dispatch;
  const prefixDispatch = config.prefixDispatch;
  const softFallThrough = config.softFallThrough !== false; // default true
  const caseSensitive = config.caseSensitive === true; // default false

  const sortedPrefixes = prefixDispatch
    ? Object.keys(prefixDispatch).sort((a, b) => b.length - a.length)
    : [];

  let out = '';
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const tildePos = input.indexOf('~', pos);
    if (tildePos < 0) {
      out += input.slice(pos);
      break;
    }

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
      consumedTerminator = nextTerm < len;
    }

    const rawCmd = input.slice(pos, cmdEnd);
    const cmd = caseSensitive ? rawCmd : rawCmd.toUpperCase();
    let result: string | undefined;

    if (cmd.length > 0) {
      const exact = dispatch[cmd];
      if (exact) {
        try {
          result = exact(width);
        } catch {
          result = '';
        }
      }
    }

    if (result === undefined && cmd.length > 0 && prefixDispatch) {
      for (const prefix of sortedPrefixes) {
        if (cmd.startsWith(prefix)) {
          const suffix = rawCmd.slice(prefix.length);
          try {
            result = prefixDispatch[prefix](suffix, width);
          } catch {
            result = '';
          }
          if (result !== undefined) break;
        }
      }
    }

    if (result !== undefined) {
      pos = cmdEnd + (consumedTerminator ? 1 : 0);
      out += result;
    } else if (softFallThrough) {
      // Soft fall-through: re-emit `~` + width digits so downstream
      // regex stages can still see the original sequence. The cmd
      // content stays in the input for the next iteration to emit as
      // plain text.
      out += '~' + widthDigits;
      // pos stays at cmd start.
    } else {
      // Strict fall-through (express.e exact): consume `~` + width
      // digits + cmd content (and terminator if it was a `|`). The cmd
      // text emits as plain.
      out += rawCmd;
      pos = cmdEnd + (consumedTerminator ? 1 : 0);
    }
  }

  return out;
}

function isDispatchConfig(
  v: MciDispatchMap | MciDispatchConfig,
): v is MciDispatchConfig {
  return (
    typeof v === 'object' &&
    v !== null &&
    'dispatch' in v &&
    typeof (v as MciDispatchConfig).dispatch === 'object'
  );
}
