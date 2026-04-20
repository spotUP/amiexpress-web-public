/**
 * Line-wrap helper extracted from xim/io.ts so the latter stays under the
 * 2000-line file-size budget.
 *
 * Pure function — no class state dependencies. Splits a single line at the
 * configured visible width, treating ANSI CSI escape sequences as zero-width
 * and expanding tabs to 8-column stops.
 */

/**
 * Split `line` into segments of at most `width` visible columns. ANSI
 * escape sequences (matching `ESC[...<letter>`) are copied through without
 * counting toward the visible width. Tabs expand to the next 8-column stop.
 *
 * Returns `[line]` unchanged when `width <= 0` or `line` is empty.
 */
export function wrapLine(line: string, width: number): string[] {
  if (width <= 0 || line.length === 0) {
    return [line];
  }

  const segments: string[] = [];
  let current = '';
  let visibleCount = 0;

  const flushCurrent = () => {
    segments.push(current);
    current = '';
    visibleCount = 0;
  };

  let i = 0;
  while (i < line.length) {
    // Handle ANSI escape sequences (don't count toward visible width)
    if (line[i] === '\x1b') {
      const remainder = line.slice(i);
      const escMatch = remainder.match(/^\x1b\[[0-9;]*[A-Za-z]/);
      if (escMatch) {
        current += escMatch[0];
        i += escMatch[0].length;
        continue;
      }
    }

    // Handle tab characters - expand to next 8-column tab stop
    if (line[i] === '\t') {
      const tabWidth = 8 - (visibleCount % 8);
      // Check if tab would cause overflow
      if (visibleCount + tabWidth > width) {
        flushCurrent();
      }
      current += line[i];
      visibleCount += tabWidth;
      i += 1;
      if (visibleCount >= width) {
        flushCurrent();
      }
      continue;
    }

    current += line[i];
    visibleCount += 1;
    i += 1;

    if (visibleCount >= width) {
      flushCurrent();
    }
  }

  if (current.length > 0 || segments.length === 0) {
    segments.push(current);
  }

  return segments;
}
