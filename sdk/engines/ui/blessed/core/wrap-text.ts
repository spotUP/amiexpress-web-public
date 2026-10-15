/**
 * Wrapping a line of tagged/ANSI text at WORD boundaries.
 *
 * The engine had two copies of this, in `Element._wrapContent` and
 * `List.wrapAnsiText`, and both broke at a hard column despite the "word
 * wrap" comments above them. On 80 columns that rarely showed; on a C64 it
 * cut every row in half - "Slot 2: (e" / "mpty)", "Stand" / "ard (9 specia" /
 * "ls)" - and the screen read as rubble (reported live, 2026-09-06).
 *
 * The SDK already had a word-aware wrapper in `sdk/petscii/wrap.ts`, but it
 * knows nothing about ANSI, and the blessed path must carry the active SGR
 * onto every continuation row or a colour ends at the fold. So this is that
 * rule with the escape handling the engine needs, in ONE place that both
 * callers use.
 *
 * A word longer than the whole width still breaks mid-word: there is nowhere
 * else to break it, and a row that overflows its box is worse than a split
 * word.
 */

const ESC = '\x1b';

export function wrapAnsiText(
  line: string,
  width: number,
  visibleWidth: (text: string) => number,
): string[] {
  if (width <= 0) return [line];

  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;
  let inAnsi = false;
  let ansiBuffer = '';
  let activeAnsi = '';
  /** Where the last space sits in `currentLine`, and how wide the text was there. */
  let breakAt: { index: number; width: number } | null = null;

  const push = (text: string) => { lines.push(text); };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === ESC) {
      inAnsi = true;
      ansiBuffer = ch;
      continue;
    }

    if (inAnsi) {
      ansiBuffer += ch;
      if (ch === 'm') {
        inAnsi = false;
        currentLine += ansiBuffer;
        activeAnsi += ansiBuffer;
        ansiBuffer = '';
      }
      continue;
    }

    if (currentWidth >= width) {
      if (breakAt && breakAt.width > 0) {
        // Break at the last space: the head keeps everything before it, and
        // the tail - the word we are in the middle of - starts the next row
        // still wearing the colour it was written in.
        const head = currentLine.slice(0, breakAt.index);
        const tail = currentLine.slice(breakAt.index + 1);
        push(head);
        currentLine = activeAnsi + tail + ch;
        currentWidth = visibleWidth(tail) + 1;
      } else {
        // One word, wider than the box. Nowhere to break but here.
        push(currentLine);
        currentLine = activeAnsi + ch;
        currentWidth = 1;
      }
      breakAt = null;
      continue;
    }

    if (ch === ' ') breakAt = { index: currentLine.length, width: currentWidth };
    currentLine += ch;
    currentWidth++;
  }

  if (currentLine) push(currentLine);
  return lines.length > 0 ? lines : [''];
}
