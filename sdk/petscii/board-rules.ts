/**
 * THE TWO RULES A C64 BOARD ACTUALLY RUNS, READ OFF THE BYTES.
 *
 * "petscii used in c64 bbs:es have limitations that our petscii editor doesnt
 * enforce, only lowercase characters are allowed and only black background"
 * and "this should apply bbs wide" (sysop, 2026-09-14), decided 2026-09-17:
 * a save that breaks either is REFUSED with the reason, and a file already on
 * the board that breaks one is REPORTED and served AS IS - an artist's file
 * changing shape on the way to a caller is the thing nobody can debug.
 *
 * `editor-surface.ts` holds the SURFACE to the rules while a screen is being
 * drawn (`conformToBoard`). This is the other half: the same two rules asked
 * of a finished `.seq`, wherever it came from - an upload, an import, a file
 * that has sat in `Screens/` since before the rules existed.
 *
 * IT IS THE MACHINE THAT ANSWERS, not a scan for bytes. `$0E` and `$8E` are
 * the bank, `$02 <colour>` is the background - but `$0E` ALSO blacks the
 * background (`petscii-machine.ts:199`), a colour byte after `$02` is eaten
 * whatever it is, and with an insert pending a control code is PAINTED rather
 * than executed. Grepping for `\x8e` gets all of that wrong in both
 * directions. So the file is replayed through `PetsciiMachine`, one byte at a
 * time, and the rules are asked of the state the caller would be looking at.
 */
import { PetsciiMachine } from './petscii-machine';
import { BOARD_BACKGROUND, BOARD_CHARSET_BANK } from './editor-surface';

/** A blank cell draws the same glyph in either bank, so it proves nothing. */
const SPACE = 0x20;

export type BoardRuleCode = 'graphics-bank' | 'non-black-background';

export interface BoardRuleViolation {
  rule: BoardRuleCode;
  /** The sysop's own words for what is wrong. Shown in the refusal and on Screen Health. */
  reason: string;
  /** How many glyphs were drawn in the graphics bank. Absent on a background violation. */
  cells?: number;
  /** Where the first offending glyph landed, 0-based. Absent on a background violation. */
  row?: number;
  column?: number;
  /** The VIC colour the file asked the screen to be. Background violations only. */
  color?: number;
}

/**
 * Counts the glyphs drawn while the screen is in the wrong bank.
 *
 * `putScreenCode` is the ONE place a glyph reaches the screen, which is why
 * the count can be neither missed nor paid twice - the same reason the
 * KERNAL's insert count lives there.
 */
class BoardRuleWatcher extends PetsciiMachine {
  cellsInGraphicsBank = 0;
  firstRow = -1;
  firstColumn = -1;

  protected putScreenCode(sc: number): boolean {
    const s = this.state;
    if (s.charsetBank !== BOARD_CHARSET_BANK && sc !== SPACE) {
      if (this.cellsInGraphicsBank === 0) {
        this.firstRow = s.cursorY;
        this.firstColumn = s.cursorX;
      }
      this.cellsInGraphicsBank++;
    }
    return super.putScreenCode(sc);
  }
}

/**
 * What this `.seq` breaks, if anything. An empty array is a file the board
 * can show as its artist drew it.
 *
 * A file that never selects a bank breaks the rule just as loudly as one that
 * selects `$8E`: a C64 powers on in the graphics bank, so art with no `$0E`
 * in front of it reaches the caller as the wrong glyphs. That is the bulk of
 * what is on this board - see the ledger for the count.
 */
export function checkBoardRules(bytes: Uint8Array | Buffer | number[]): BoardRuleViolation[] {
  const machine = new BoardRuleWatcher();
  const violations: BoardRuleViolation[] = [];
  let worstBackground: number | null = null;

  for (const byte of bytes) {
    machine.feed([byte]);
    const bg = machine.state.background;
    if (bg !== BOARD_BACKGROUND && bg !== worstBackground) worstBackground = bg;
  }

  if (machine.cellsInGraphicsBank > 0) {
    violations.push({
      rule: 'graphics-bank',
      reason: 'A C64 board shows the lowercase bank, and this screen draws in the graphics one',
      cells: machine.cellsInGraphicsBank,
      row: machine.firstRow,
      column: machine.firstColumn,
    });
  }
  if (worstBackground !== null) {
    violations.push({
      rule: 'non-black-background',
      reason: 'A C64 board runs on a black screen, and this one sets the background and border to another colour',
      color: worstBackground,
    });
  }
  return violations;
}

/** One sentence for a refusal: what is wrong, and nothing about how to fix it. */
export function boardRulesReason(violations: readonly BoardRuleViolation[]): string {
  return violations.map(v => v.reason).join('. ') + '.';
}
