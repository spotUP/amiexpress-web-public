/**
 * How far right an ANSI stream actually paints.
 *
 * A wipe frame carries no newlines: it addresses each row with a CUP and
 * paints a run. Splitting such a stream on `\n` therefore measures one line
 * thousands of columns long and says nothing about what the caller sees.
 * This replays the stream against the same model the wipe engine writes for -
 * move, then paint - and answers with the furthest column any glyph lands in.
 */
export function widestColumnPainted(text: string): number {
  let widest = 0;
  let col = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      const end = text.slice(i).search(/[A-Za-z]/);
      if (end === -1) break;
      const seq = text.slice(i, i + end + 1);
      const cup = /^\x1b\[(\d*);(\d*)[Hf]$/.exec(seq);
      if (cup) col = Math.max(0, parseInt(cup[2] || '1', 10) - 1);
      else if (/^\x1b\[[0-9;]*[Hf]$/.test(seq)) col = 0;
      i += end + 1;
      continue;
    }
    const ch = text[i];
    if (ch === '\r' || ch === '\n') col = 0;
    else { col += 1; if (col > widest) widest = col; }
    i++;
  }
  return widest;
}
