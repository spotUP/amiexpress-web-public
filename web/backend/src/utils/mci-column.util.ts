/**
 * Where the cursor is, in PRINTABLE columns, part-way through a rendered row.
 *
 * `~t<nn>|` (the column tab, see the C64 file-view design's "The layout is
 * data") pads forward to a target column, so it has to know the column it is
 * already at - and the text it is measuring is half-rendered output that
 * carries attribute bytes in whichever flavour the caller is rendering for.
 *
 * WHY NOT `printableLength()`. That one strips ANSI escapes and nothing else,
 * which is right for an 80-column session and wrong for a C64: a PETSCII pen
 * is a RAW BYTE in the stream ($05, $1C, $9B...), not an escape sequence, and
 * counting it as a glyph puts every column after it one place out.
 *
 * The PETSCII rule is the character ROM's own: $20-$7F and $A0-$FF are glyphs
 * that occupy a cell; everything else - the C0 range, and $80-$9F - is a pen,
 * a reverse toggle, a cursor move or a return, and occupies none.
 *
 * Both flavours count from the LAST row break, because a `~CR|` or `~n1|`
 * earlier in the same template line starts a new output row and resets the
 * origin. `~t` is never file-absolute.
 */

/** ANSI CSI/OSC-ish escape, the same shape `printableLength()` strips. */
const ANSI_TOKEN_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Row breaks: CR, LF, and PETSCII's $0D (which is the same byte as CR). */
const ROW_BREAK_RE = /[\r\n]/;

/**
 * The printable column the next character would land on, given everything
 * emitted so far on this line.
 *
 * @param out    output rendered so far (may contain several rows)
 * @param petscii true when the stream carries PETSCII bytes, false for ANSI
 */
export function printableColumn(out: string, petscii: boolean): number {
  const lastBreak = lastIndexOfRowBreak(out);
  const row = lastBreak < 0 ? out : out.slice(lastBreak + 1);

  if (!petscii) {
    return row.replace(ANSI_TOKEN_RE, '').length;
  }

  let columns = 0;
  for (const ch of row) {
    const code = ch.codePointAt(0) as number;
    if ((code >= 0x20 && code <= 0x7f) || code >= 0xa0) columns++;
  }
  return columns;
}

function lastIndexOfRowBreak(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (ROW_BREAK_RE.test(text[i])) return i;
  }
  return -1;
}

/**
 * The spaces `~t<nn>|` emits to reach column `target` from `out`.
 *
 * Forward-only and never truncating, which is C*Base's behaviour
 * (`ml1.o.asm:1464-1490`) and what the spec adopts: a field that has overrun
 * its column simply butts up against the next one rather than being cut or
 * pushed onto another row.
 *
 * @returns the padding, or '' when the cursor is already at or past `target`
 */
export function columnTabPadding(out: string, target: number, petscii: boolean, rowWidth = 40): string {
  if (!Number.isInteger(target) || target < 0) return '';
  // A target at or past the row's own width can never be reached by padding;
  // emitting the spaces would wrap the row instead, which is the one thing
  // this must not do.
  if (target >= rowWidth) return '';
  const column = printableColumn(out, petscii);
  if (column >= target) return '';
  return ' '.repeat(target - column);
}
