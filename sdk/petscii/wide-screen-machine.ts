/**
 * The web terminal's WIDE PETSCII screen: 80x25, and ours.
 *
 * It is not a C128 and it does not claim to be one. Nothing on the wire
 * distinguishes a C128-at-80 from a C64-at-40, so the mode is CHOSEN at the
 * graphics prompt (`P8`), never detected, and what it describes is the
 * canvas this board ships - which is why the semantics below are stated
 * rather than emulated from a ROM.
 *
 * Two of the C64's rules are gone, and each for a reason of its own:
 *
 *  - **Logical lines do not exist.** A C64 links two 40-column rows into one
 *    80-character line, and RETURN, INSERT and DELETE all work on that line
 *    (ROM E8EA, and `logicalLineEndRow` in petscii-machine.ts). At 80
 *    columns per row that rule has nothing to say: a row IS a line.
 *  - **`$02 <colour>` is not read.** Setting background and border with it
 *    is CCGMS's TERMINAL convention, which this board follows at 40. On a
 *    C128's 80-column screen $02 is UNDERLINE ON, so a byte that means one
 *    thing here and another there is a byte this screen does not read -
 *    and the transducer never emits it at 80 either. The canvas paints its
 *    own ground.
 *
 * Everything else - the screen and colour RAM, the cursor, the charset
 * banks, reverse, insert, scroll - is the same model, which is why this is
 * a shape rather than a second copy of four hundred lines.
 */
import { PetsciiMachine } from './petscii-machine';
import type { PetsciiScreenShape } from './petscii-machine';

/** The wide screen's shape: 80x25, no logical lines, no background prefix. */
export const WIDE_SCREEN_SHAPE: Omit<Required<PetsciiScreenShape>, 'historyRows'> = {
  cols: 80,
  rows: 25,
  logicalLines: false,
  backgroundPrefix: false,
};

export class WideScreenMachine extends PetsciiMachine {
  /**
   * The SHAPE is fixed - that is what this class is - so the only thing a
   * caller may choose is how much history the screen keeps, exactly as on
   * the 40-column machine.
   */
  constructor(options: { historyRows?: number } = {}) {
    super({ ...WIDE_SCREEN_SHAPE, historyRows: options.historyRows });
  }
}
