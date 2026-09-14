/**
 * A PETSCII screen, back into the `.seq` byte stream it came from.
 *
 * `PetsciiMachine` has always read the stream: a `.seq` is what you would
 * send a C64 down a wire - printable codes, colour controls, reverse on and
 * off - and the machine walks it into a 40x25 grid of screen codes and
 * colour RAM. That is the half the board needed to SHOW a `.seq`, and it is
 * why the studio's preview is right.
 *
 * Nothing has ever written one. So an artist who opened a `.seq` in the
 * studio got a picture and no way to change it (`ArtistScreenDialog` renders
 * `PetsciiScreenPreview` and stops), and the "Redraw this in my theme"
 * button copied a file into their theme that they then could not edit. This
 * is the other half: a grid, back to bytes a C64 would draw identically.
 *
 * THE CONTRACT IS THE ROUND TRIP. `write(read(bytes))` must produce a stream
 * that reads back to the same screen - not necessarily the same bytes, and
 * deliberately so: the art program that wrote the original may have set a
 * colour it never used or turned reverse off twice, and reproducing those
 * would mean keeping a byte log rather than a picture. What must not change
 * is what the caller SEES.
 */
import { PETSCII_COLOR_TO_VIC } from './c64-palette';
import { screenCodeToPetscii } from './screen-codes';
import type { PetsciiMachineState } from './petscii-machine';

/** VIC index -> the PETSCII byte that selects it. */
const VIC_TO_PETSCII: readonly number[] = (() => {
  const table = new Array<number>(16).fill(0x05);
  for (const [byte, vic] of Object.entries(PETSCII_COLOR_TO_VIC)) table[vic] = Number(byte);
  return table;
})();

/** Reverse on, reverse off, and the two charset banks, as the C64 spells them. */
const RVS_ON = 0x12;
const RVS_OFF = 0x92;
const CHARSET_UPPER = 0x8e;   // uppercase/graphics, the power-on bank
const CHARSET_LOWER = 0x0e;   // lowercase/uppercase
const RETURN = 0x0d;
/** CCGMS's background prefix: `$02 <colour>` sets background AND border. */
const BACKGROUND_PREFIX = 0x02;
/**
 * express.e's MCI opt-in, and the only bytes that may precede the charset one.
 *
 * The gate is the file's FIRST byte being `~` (express.e:6800-6806,
 * implemented at `petscii-screen.render.ts:252`), evaluated once per file. A
 * bare `~` will not do: the tokenizer PRINTS an unrecognised command's text,
 * which is why `~WX` reaches a C64 as the letters `WX`. `~D|` is a
 * `~D<char>` terminator change - `applyMciPrePasses` STRIPS it from the text
 * and renders nothing (`mci-pre-passes.ts:106-161`) - and it sets the
 * terminator to the `|` that was already the default.
 */
const MCI_GATE: readonly number[] = [0x7e, 0x44, 0x7c];

export interface SeqWriteOptions {
  /**
   * Emit the charset bank at the top. On by default: a `.seq` that does not
   * say which bank it wants is drawn in whatever the last screen left, and
   * the board's screens are mixed.
   */
  declareCharset?: boolean;
  /**
   * Emit the CCGMS background prefix `$02 <colour>`, which sets background
   * AND border - a C64 ties them, which is why the model does too.
   *
   * Defaults to ON for a non-black screen and OFF for a black one: a board
   * whose screens are all black gains no bytes, and a screen an artist
   * authored blue stays blue.
   *
   * ORDER IS LOAD-BEARING, and it is the reason this is emitted here rather
   * than at the top. `$0E` - the lowercase charset bank - BLACKS background
   * and border on a CCGMS reader (`petscii-machine.ts:198`). A background
   * written BEFORE the charset byte is erased by the byte that follows it,
   * and the screen comes back black with every other assertion still green.
   */
  declareBackground?: boolean;
  /**
   * Open the file with express.e's MCI gate, so its `~` codes are rendered
   * rather than drawn as letters.
   *
   * OFF by default, and that default is the sysop's rule rather than
   * caution: once a `.seq` is gated in, EVERY `0x7E` in it is a token
   * candidate, so a screen becomes MCI because its author said so and never
   * because a writer guessed.
   */
  mciGate?: boolean;
}

/**
 * The screen as `.seq` bytes.
 *
 * Colour and reverse are emitted only when they CHANGE, which is what makes
 * this a file rather than a dump: a run of one colour costs one control byte,
 * and the board's titles are mostly long runs.
 */
export function writeSeq(state: PetsciiMachineState, options: SeqWriteOptions = {}): Uint8Array {
  return writeSeqWithOffsets(state, options).bytes;
}

/** The bytes, and the byte each cell was written at. */
export interface SeqWriteResult {
  bytes: Uint8Array;
  /**
   * `offsetOfCell[y * cols + x]` is the index in `bytes` of the byte that
   * draws that cell, or `-1` for a cell the writer elided - a trailing blank
   * a RETURN stands in for.
   *
   * The editor needs it to turn an MCI token's BYTE offsets back into cells
   * to highlight. Tokens are found in the bytes, never on the grid, because
   * the bytes are what `preparePetsciiSeq` gates and tokenizes; a second idea
   * of what a token is would be a second source of truth.
   */
  offsetOfCell: Int32Array;
}

/**
 * `writeSeq`, plus where each cell landed. See `SeqWriteResult.offsetOfCell`.
 */
export function writeSeqWithOffsets(
  state: PetsciiMachineState,
  options: SeqWriteOptions = {},
): SeqWriteResult {
  const { declareCharset = true, mciGate = false } = options;
  const out: number[] = [];
  const offsetOfCell = new Int32Array(state.cols * state.rows).fill(-1);

  // FIRST, before the charset byte: the gate is tested on byte zero.
  if (mciGate) out.push(...MCI_GATE);

  if (declareCharset) out.push(state.charsetBank === 1 ? CHARSET_LOWER : CHARSET_UPPER);

  // AFTER the charset byte, never before it - see `declareBackground`.
  const declareBackground = options.declareBackground ?? state.background !== 0;
  if (declareBackground) {
    out.push(BACKGROUND_PREFIX, VIC_TO_PETSCII[state.background & 0x0f]);
  }

  /*
   * What the reader starts from, and it is not white.
   *
   * `PetsciiMachine` powers on with pen VIC 14 - light blue, the C64's own
   * power-on colour - and a writer that assumed white emitted no colour byte
   * for the first white cell, so the reader drew it in 14. The first letter
   * of a round trip came back the wrong colour.
   */
  let pen = 14;
  let reverse = false;

  for (let y = 0; y < state.rows; y++) {
    // How far this row is worth writing: everything to the right of the last
    // cell that draws is a RETURN's job, not twenty spaces'.
    /*
     * Trailing blanks are a RETURN's job, not twenty spaces'.
     *
     * This is not only size. Printing the very last cell of the screen -
     * row 24, column 39 - SCROLLS a C64, so a writer that pads every row to
     * the full width loses the top row of its own picture. (Written that
     * way first: the round trip came back with an empty screen.) A reversed
     * space is not blank, so a bar that runs to the edge still reaches it.
     */
    let last = state.cols - 1;
    while (last >= 0 && isBlank(state, y, last)) last--;

    for (let x = 0; x <= last; x++) {
      const index = y * state.cols + x;
      const code = state.screen[index];
      const wantReverse = (code & 0x80) !== 0;
      const wantPen = state.colorRam[index] & 0x0f;

      // A blank cell in the background colour carries no colour of its own -
      // emitting one would be a control byte that changes nothing visible and
      // would then have to be changed back.
      if (!(isBlank(state, y, x) && !wantReverse)) {
        if (wantPen !== pen) { out.push(VIC_TO_PETSCII[wantPen]); pen = wantPen; }
      }
      if (wantReverse !== reverse) { out.push(wantReverse ? RVS_ON : RVS_OFF); reverse = wantReverse; }

      offsetOfCell[index] = out.length;
      out.push(seqByteFor(code & 0x7f));
    }

    // Reverse never crosses the end of a row: a C64 turns it off at the end
    // of a line anyway, and leaving it on makes the next row's first cell
    // depend on this row's last.
    if (reverse) { out.push(RVS_OFF); reverse = false; }

    /*
     * A RETURN only when the row did NOT reach the last column.
     *
     * Printing the fortieth character of a row wraps the cursor by itself -
     * that is what a 40-column screen does - so a RETURN after it advances a
     * SECOND time and everything below slides down a row. Written that way,
     * a full-width title scrolled its own top off the screen: the round trip
     * came back four rows short.
     */
    const wrapped = last === state.cols - 1;
    if (y < state.rows - 1 && !wrapped) out.push(RETURN);
  }

  return { bytes: Uint8Array.from(out), offsetOfCell };
}

/**
 * The PETSCII byte this writer chooses for a screen code.
 *
 * A C64 has TWO bytes for every screen code in $40-$5F - the low mirror
 * $60-$7F and the shifted range $C0-$DF - and they draw the same glyph in
 * both banks. `screenCodeToPetscii` answers the shifted one, which is a
 * correct answer and the wrong one for a FILE.
 *
 * `~` ($7E) and `|` ($7C) live in that band. They are express.e's MCI opt-in
 * byte, tested on a `.seq`'s FIRST byte (express.e:6800-6806, implemented at
 * petscii-screen.render.ts:252), and the default MCI terminator. Written as
 * $DE and $DC, every token an artist authors in the studio reaches
 * `preparePetsciiSeq` as bytes it does not recognise: the gate never opens
 * and the screen prints the token's letters as art. Nothing throws and
 * nothing logs, and the round trip stays green either way - which is why this
 * needed a test that names the BYTE rather than the picture.
 *
 * So the writer prefers the LOW mirror. The picture is unchanged on a real
 * C64; the file becomes byte-compatible with the ASCII the MCI tokenizer
 * reads.
 */
function seqByteFor(screenCode: number): number {
  if (screenCode >= 0x40 && screenCode <= 0x5f) return screenCode + 0x20;
  return screenCodeToPetscii(screenCode);
}

/** A cell nothing is drawn in: a space, in no reverse. */
function isBlank(state: PetsciiMachineState, y: number, x: number): boolean {
  const index = y * state.cols + x;
  const code = state.screen[index];
  // Screen code 32 is the space in both banks; bit 7 is reverse.
  return (code & 0x7f) === 32 && (code & 0x80) === 0;
}
