/**
 * The E compiler's `StringF`, as much of it as GLCViewer uses.
 *
 * Every row and every footer line in `GLCViewer.e` is one `StringF` call, and
 * its field codes ARE the layout: `\l\s[18]` is "this string, left-justified,
 * in eighteen columns"; `\r\s[3]` is right-justified in three. Byte parity
 * with the 68K door is largely parity with these, so the templates are used
 * verbatim from the source (`art.generated.ts`) and interpreted here rather
 * than being rewritten as template literals - a rewrite is where the widths
 * would quietly change.
 *
 * E TRUNCATES a field rather than overflowing it. That is not a detail: a
 * 25-character BBS name in an 18-column field is cut, and a port that let it
 * push the row wider would misalign every column after it.
 */

/** `\l\s[width]` - left-justified, padded or cut to exactly `width`. */
export function leftField(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

/** `\r\s[width]` - right-justified, padded or cut to exactly `width`. */
export function rightField(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : ' '.repeat(width - value.length) + value;
}

/**
 * Fill one of the source's own templates.
 *
 * Arguments are consumed in order, as E does - the template says how each is
 * justified and how wide it sits. `\s` with no width is the bare string.
 */
export function formatE(template: string, args: readonly string[]): string {
  let next = 0;
  return template.replace(/\\([lr])\\s\[(\d+)\]|\\s/g, (_match, justify?: string, width?: string) => {
    const value = args[next++] ?? '';
    if (!width) return value;
    const columns = Number(width);
    return justify === 'r' ? rightField(value, columns) : leftField(value, columns);
  });
}

/**
 * A transferred size, the way GLC prints it (`GLCViewer.e:207-227`).
 *
 * The server sends KILOBYTES as a decimal string - `upkb` in the source, and
 * the name is the only thing that says so. Four digits or fewer print as they
 * stand; anything else is shifted down ten bits into megabytes, and
 * megabytes over 999 shift again into gigabytes with one fractional digit
 * from the low ten bits - dropped at ten gigabytes and up, because the field
 * is four characters wide and `10.2G` is five.
 *
 * The `----` prefix is not decoration. The E source builds `'----' + value`
 * and passes `upload+StrLen(upload)-4` to StringF: THE LAST FOUR CHARACTERS.
 * That is how a short value right-aligns and a long one keeps its tail, and
 * reproducing it exactly is what lets the arithmetic be compared with the
 * original's output rather than with a description of it.
 */
export function transferField(raw: string): string {
  const parsed = parseInt(raw, 10);
  const bytes = Number.isNaN(parsed) ? 0 : parsed;

  let padded: string;
  if (bytes < 0 || bytes > 9999) {
    const megabytes = (bytes >> 10) & 0x003fffff;
    if (megabytes > 999) {
      const whole = megabytes >> 10;
      const fraction = ((megabytes & 1023) * 10) >> 10;
      padded = whole > 9 ? `----${whole}G` : `----${whole}.${fraction}G`;
    } else {
      padded = `----${megabytes}M`;
    }
  } else {
    padded = `----${raw}`;
  }

  // `IF StrLen(upload)>8 THEN StrCopy(upload,'----LOTS')` (E:258): too wide
  // even for that is NAMED rather than truncated into nonsense.
  if (padded.length > 8) padded = '----LOTS';

  return padded.slice(-4);
}
