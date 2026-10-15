/**
 * The E compiler's `StringF`, as the ported Amiga doors use it.
 *
 * Every row of a door written in E is one `StringF` call, and its field codes
 * ARE the layout: `\l\s[23]` is "this string, left-justified, in twenty-three
 * columns", `\r\s[18]` is right-justified in eighteen, `\r\d[2]` is a number
 * right-justified in two. Porting a screen is largely porting these, so the
 * templates are kept verbatim from the E source and interpreted here rather
 * than rewritten as template literals - a rewrite is where the widths quietly
 * change and every column after them stops lining up.
 *
 * E TRUNCATES a field rather than overflowing it. That is not a detail: a
 * 25-character location in a 24-column field is cut, and a port that let it
 * push the row wider would misalign the whole table.
 *
 * NOTE: `Doors/glc-viewer/src/estringf.ts` is the older copy this one grew
 * from, without `\d`. Point that door at this module the next time it is
 * touched - it was left alone here only because its `dist/` is committed and
 * rebuilding another lane's door sweeps that lane's work in.
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
 * Arguments are consumed in order, as E does. `\l\s[n]` and `\r\s[n]` justify
 * a string, `\r\d[n]` and `\l\d[n]` a number, and a bare `\s` or `\d` is the
 * value as it stands. A number is stringified first, so the caller can pass
 * either.
 */
export function formatE(template: string, args: readonly (string | number)[]): string {
  let next = 0;
  return template.replace(/\\([lr])\\([sd])\[(\d+)\]|\\[sd]/g, (_match, justify?: string, _kind?: string, width?: string) => {
    const value = String(args[next++] ?? '');
    if (!width) return value;
    const columns = Number(width);
    return justify === 'r' ? rightField(value, columns) : leftField(value, columns);
  });
}

/** Printable columns of a line - CSI sequences take no space on screen. */
export function printableWidth(line: string): number {
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x0c\r\n]/g, '').length;
}
