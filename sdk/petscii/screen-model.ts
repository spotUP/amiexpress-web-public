/**
 * What a PETSCII screen model is, whatever its width.
 *
 * Two implement it: `PetsciiMachine` (40x25, this board's C64 - it models
 * the KERNAL, logical lines and all) and `WideScreenMachine` (80x25, the
 * web terminal's wide screen - OURS, not a C128 emulation). Everything that
 * consumes a screen - the transducer, the server-side renderer, the canvas -
 * speaks this and reads the width off `state`, so neither of them carries a
 * literal 40 or 80.
 */
import type { PetsciiMachineState } from './petscii-machine';

export interface PetsciiScreenModel {
  readonly state: PetsciiMachineState;
  /** Feed PETSCII bytes; the state is what they left behind. */
  feed(bytes: Uint8Array | Buffer | number[]): void;
  reset(): void;
  /**
   * The last row of the logical line row `y` belongs to.
   *
   * A C64 links two 40-column rows into one 80-character line, and INSERT
   * and DELETE work on that line. At 80 columns a row IS a line, so the
   * wide model answers `y` - which is what makes the same transducer code
   * correct at both widths without asking which one it is on.
   */
  logicalLineEndRow(y: number): number;
}
