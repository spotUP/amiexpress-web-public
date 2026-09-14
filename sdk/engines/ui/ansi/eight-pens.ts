/**
 * Sixteen-colour art, folded onto the eight pens an Amiga actually had.
 *
 * AmiExpress ran on console.device, and console.device has EIGHT pens.
 * Sixteen were possible with `ibmcon`, and almost nobody ran it; the Amiga
 * had no iCE colours either, so a bright BACKGROUND was never something a
 * caller could be shown (sysop, 2026-09-14). Art drawn on a PC - which is
 * most art - reaches for the aixterm bright codes, `ESC[90m` through
 * `ESC[97m` and `ESC[100m` through `ESC[107m`, and an Amiga terminal that
 * has never heard of them either ignores the sequence or prints it.
 *
 * The fold rewrites those to the eight the Amiga has, and it drops BOLD with
 * them.
 *
 * Bold was exempt at first, on the reasoning that console.device has bold and
 * an Amiga caller seeing bold yellow where a PC caller sees bright yellow is
 * the medium working. A census of this board's own art settled it the other
 * way: ZERO aixterm codes in 23 files, and 1320 `ESC[1;3Xm`. Bright-by-bold
 * is how every sixteenth colour on this board is written, so a fold that
 * spares it is a fold that does nothing - the sysop would set his board to
 * eight colours and every web and telnet caller would still see sixteen.
 *
 * So on an eight-colour board bold goes, and a sequence left with no
 * parameters at all goes with it: `ESC[1m` becoming `ESC[m` would be a RESET,
 * which is the one thing it must not turn into.
 *
 * Pure and in the SDK so the backend's output choke and the browser studio's
 * preview can agree about what "eight colours" means.
 */

/** An SGR sequence and the parameters inside it. */
const SGR = /\x1b\[([0-9;]*)m/g;

/** The pen a bright colour lands on: the low three bits. */
export function eightPen(colour: number): number {
  return ((colour % 8) + 8) % 8;
}

/**
 * Rewrite one SGR parameter for a terminal with eight pens.
 *
 * 90-97 (bright foreground) become 30-37, 100-107 (bright background, the
 * iCE range) become 40-47. Everything else - bold, blink, reverse, the
 * ordinary colours, the resets - passes through untouched.
 */
export function foldSgrParameter(param: number): number {
  if (param >= 90 && param <= 97) return param - 60;
  if (param >= 100 && param <= 107) return param - 60;
  return param;
}

/**
 * Fold every colour in a stream of ANSI onto the eight pens.
 *
 * Text with no bright codes comes back BYTE-IDENTICAL - the common case on
 * this board, where most screens were drawn for an Amiga in the first place,
 * and the guarantee that makes this safe to run over everything the board
 * sends.
 */
export function foldAnsiToEightPens(text: string): string {
  if (!text.includes('\x1b[')) return text;

  return text.replace(SGR, (whole, params: string) => {
    // `ESC[m` is `ESC[0m` written short; it has no colour to fold.
    if (params === '') return whole;

    let changed = false;
    const folded: string[] = [];
    for (const part of params.split(';')) {
      // An empty parameter is a zero by the standard, and keeping the empty
      // string keeps the sequence byte-identical.
      if (part === '') { folded.push(part); continue; }
      const value = Number(part);
      if (!Number.isFinite(value)) { folded.push(part); continue; }
      // Bold is the sixteenth colour on this board; on eight pens it is not
      // available, and a terminal that reads it as brightness would undo the
      // whole fold.
      if (value === 1) { changed = true; continue; }
      const next = foldSgrParameter(value);
      if (next !== value) changed = true;
      folded.push(String(next));
    }

    if (!changed) return whole;
    // Nothing left to say: `ESC[m` is a reset, so the sequence goes instead.
    if (folded.length === 0) return '';
    return `\x1b[${folded.join(';')}m`;
  });
}
