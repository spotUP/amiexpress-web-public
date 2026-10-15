import chalk from 'chalk';

/**
 * Animates the header rail by writing only its own cells.
 *
 * Ink renders a frame as one string, so driving this from React state
 * repainted the entire console four times a second to move three characters.
 * Instead the rail is painted in place: save the cursor, jump to the rail's
 * row and column, write the glyphs, restore the cursor. Ink knows nothing
 * about it and never re-renders.
 *
 * The trade: Ink's next real render draws the static placeholder over the
 * top, so the rail sits still for up to one tick before this repaints it.
 * That is invisible next to a full-screen repaint, and renders are rare now.
 */
export interface RailAnimation {
  stop: () => void;
}

const ESC = String.fromCharCode(27);
const SAVE_CURSOR = ESC + '7';
const RESTORE_CURSOR = ESC + '8';

function paint(text: string, colour: string): string {
  const tint = colour.startsWith('#')
    ? chalk.hex(colour)
    : (chalk as unknown as Record<string, ((s: string) => string) | undefined>)[colour];
  return typeof tint === 'function' ? chalk.bold(tint(text)) : chalk.bold(text);
}

export function startRailAnimation(opts: {
  rail: string;
  colour: string;
  row: number;
  col: number;
  intervalMs?: number;
  stream?: NodeJS.WriteStream;
}): RailAnimation {
  const stream = opts.stream ?? process.stdout;
  const period = opts.rail.length;

  // Nothing to animate, and nowhere to animate it: a redirected stdout has no
  // addressable cells, and escape codes would corrupt whatever is reading it.
  if (period === 0 || !stream.isTTY) return { stop: () => {} };

  const at = (body: string) =>
    SAVE_CURSOR + ESC + '[' + opts.row + ';' + opts.col + 'H' + body + RESTORE_CURSOR;

  let frame = 0;
  const draw = () => {
    const shift = frame % period;
    const glyphs = ' '.repeat(shift) + opts.rail.slice(0, period - shift);
    stream.write(at(paint(glyphs, opts.colour)));
    frame++;
  };

  draw();
  const id = setInterval(draw, opts.intervalMs ?? 250);
  return {
    stop: () => {
      clearInterval(id);
      // Leave behind the static placeholder Ink already believes is there.
      stream.write(at(paint(opts.rail, opts.colour)));
    },
  };
}

/**
 * Write a single line of text at an absolute cell, leaving the cursor where
 * it was. The same trick the rail uses, for anything else that changes far
 * more often than the frame it lives in.
 *
 * Ink owns the truth: its next render redraws whatever it believes is there,
 * so only paint things Ink will also render correctly on its own.
 */
export function paintAt(row: number, col: number, body: string, stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) return;
  stream.write(SAVE_CURSOR + ESC + '[' + row + ';' + col + 'H' + body + RESTORE_CURSOR);
}

/** Colour helper shared with the rail, so callers need not import chalk. */
export function tinted(text: string, colour: string, opts: { bold?: boolean; dim?: boolean } = {}): string {
  const tint = colour.startsWith('#')
    ? chalk.hex(colour)
    : (chalk as unknown as Record<string, ((s: string) => string) | undefined>)[colour];
  let out = typeof tint === 'function' ? tint(text) : text;
  if (opts.bold) out = chalk.bold(out);
  if (opts.dim) out = chalk.dim(out);
  return out;
}
