/**
 * What a PETSCII terminal is showing, read back from wire bytes.
 *
 * The screen code the transducer prints for a character, derived from the
 * SDK's own `printablePetsciiToScreenCode` + `UNICODE_TO_PETSCII` rather than
 * a hand-rolled table - a reverse table here would be a second opinion about
 * the mapping, which is exactly what an oracle must not be.
 *
 * Width-agnostic on purpose: the machine carries its own shape, so the same
 * readback answers for a C64's 40x25 screen and the web terminal's 80x25 one.
 */
import {
  PetsciiMachine,
  UNICODE_TO_PETSCII,
  printablePetsciiToScreenCode,
} from '@amiexpress/bbs-door-sdk/petscii';

/** The screen code (bank 1, reverse bit clear) for `ch`, or null if it has none. */
export function expectedScreenCode(ch: string): number | null {
  const code = ch.codePointAt(0) as number;
  if (code >= 0x61 && code <= 0x7a) return 0x01 + (code - 0x61);
  if (code >= 0x41 && code <= 0x5a) return 0x41 + (code - 0x41);
  if ((code >= 0x20 && code <= 0x3f) || code === 0x40 || code === 0x5b || code === 0x5d) {
    return printablePetsciiToScreenCode(code);
  }
  const mapped = UNICODE_TO_PETSCII.get(ch);
  return typeof mapped === 'number' ? printablePetsciiToScreenCode(mapped) : null;
}

/** The screen codes of one row, reverse bit cleared. */
export function screenRow(machine: PetsciiMachine, y: number): number[] {
  const { screen, cols } = machine.state;
  const row: number[] = [];
  for (let x = 0; x < cols; x++) row.push(screen[y * cols + x] & 0x7f);
  return row;
}

/** Is `text` on the machine's screen, on one row, as a contiguous run? */
export function screenShows(machine: PetsciiMachine, text: string): boolean {
  const want = Array.from(text).map(expectedScreenCode);
  if (want.some((c) => c === null)) {
    throw new Error(`signature has an unmappable character: ${text}`);
  }
  for (let y = 0; y < machine.state.rows; y++) {
    const row = screenRow(machine, y);
    for (let start = 0; start + want.length <= row.length; start++) {
      let hit = true;
      for (let i = 0; i < want.length; i++) {
        if (row[start + i] !== want[i]) { hit = false; break; }
      }
      if (hit) return true;
    }
  }
  return false;
}

/**
 * Was `text` EVER on the screen while these bytes arrived?
 *
 * A door that paints more rows than the screen has scrolls its own opening
 * off the glass: `ctop` centres `- NO UPLOADERS ARE AVAILABLE IN THIS
 * CONFERENCE -` on slot 5 of a ~32-row screen, and by the time its totals
 * block lands, slot 5 is gone. Asking the FINAL screen whether the caller was
 * told is then a question about arithmetic, not about the door - the caller
 * read it and scrolled past it, exactly as they would on a real terminal.
 *
 * The machine is passed in rather than built here: the same question is asked
 * of a C64's 40x25 screen and the web terminal's 80x25 one, and the caller
 * knows which they have.
 */
export function everShowed(
  machine: PetsciiMachine,
  chunks: Iterable<Buffer | Uint8Array>,
  text: string,
): boolean {
  for (const chunk of chunks) {
    machine.feed(chunk as Buffer);
    if (screenShows(machine, text)) return true;
  }
  return false;
}

/** `bytes` in `size`-byte pieces, for feeding a machine the way the wire did. */
export function inChunks(bytes: Buffer, size = 64): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}
