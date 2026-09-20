/**
 * A door waiting for a KEYPRESS must not give up on a human timescale.
 *
 * `waitForReply` had one five-second deadline for every XIM command. For the
 * commands the BBS answers itself that is a sane safety stop. For `JH_HK` and
 * `JH_LI` it is not a timeout at all - it is a guess about how fast the
 * CALLER is - and when it expired `hotKey()` read the still-empty string
 * buffer and handed the door character 0 as though the caller had typed it.
 *
 * GWall is where the sysop saw it (2026-09-14: "double color prompt now").
 * Its colour menu - `[W]HITE - [R]ED - [Y]ELLOW - [D]ARKBLUE - [P]INK -
 * [C]YAN - [G]REEN` - takes a person longer than five seconds to read. Every
 * caller therefore got a phantom keypress, the door rejected character 0 as
 * an invalid colour, and redrew the entire menu; the real keystroke landed on
 * the SECOND read, so it worked and looked broken.
 *
 * The `[y/N]` prompts in the same door hid the identical fault, because a
 * character 0 there simply reads as "not y" and the door moves on. That is
 * why this surfaced as a cosmetic duplicate rather than as lost input.
 *
 * Proved end-to-end before this was written, with the real binary through
 * `run-amiga-door.ts`: pressing the colour key 3 s after the prompt drew the
 * menu once, and pressing it at 26 s drew it twice and logged
 * `HotKey() -> char: 0`. After the fix, 26 s draws it once.
 */
import * as fs from 'fs';
import * as path from 'path';
import { waitBudgetMs } from '../../src/amiga-emulation/api/AEDoorLibrary';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

/** Longer than any person takes to read a menu and decide. */
const A_HUMAN_PAUSE_MS = 30_000;

describe('how long a door waits for a reply', () => {
  it('outlasts a caller reading a menu before pressing a key', () => {
    // The GWall colour menu, and the reason this file exists.
    expect(waitBudgetMs(XIMCommand.JH_HK)).toBeGreaterThan(A_HUMAN_PAUSE_MS);
  });

  it('outlasts a caller typing a line of text', () => {
    // Line input is the worse case: a comment can take a minute to write.
    expect(waitBudgetMs(XIMCommand.JH_LI)).toBeGreaterThan(A_HUMAN_PAUSE_MS);
  });

  it('still stops eventually, so a wedged door cannot hold a node for ever', () => {
    // The safety stop is kept - it is only moved out of a caller's way.
    expect(Number.isFinite(waitBudgetMs(XIMCommand.JH_HK))).toBe(true);
    expect(waitBudgetMs(XIMCommand.JH_HK)).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('outlasts a caller typing at a PROMPT, which is not the same command', () => {
    /*
     * 2026-09-20, and the reason this test changed. `JH_PM` was on the
     * machine list above as "post message". It is E's `Prompt()` - prompt,
     * then read a line - and GWall reads its comment with it. A caller who
     * took longer than five seconds to type therefore blew the stop, the
     * board answered that message afterwards, and every command from then
     * on was answered by the previous one's reply: `HotKey()` returned
     * character 0 one millisecond after each prompt, the door rejected it
     * as a colour, redrew the menu and spun. "it loops again".
     */
    expect(waitBudgetMs(XIMCommand.JH_PM)).toBeGreaterThan(A_HUMAN_PAUSE_MS);
  });

  it('outlasts a caller at an extended hotkey prompt', () => {
    expect(waitBudgetMs(XIMCommand.JH_ExtHK)).toBeGreaterThan(A_HUMAN_PAUSE_MS);
  });

  it('keeps the short stop for a command the board answers itself', () => {
    // These do not wait for a person, so a long stall IS a fault worth
    // stopping. Widening the budget for everything would have hidden those.
    for (const command of [
      XIMCommand.JH_SM,   // send message
      XIMCommand.JH_SG,   // show gfile
      XIMCommand.JH_SF,   // send file
    ]) {
      expect(waitBudgetMs(command)).toBe(5000);
    }
  });

  it('treats an unknown command as one the board answers', () => {
    // The safe default: a command nobody has classified is not assumed to be
    // waiting for a person.
    expect(waitBudgetMs(9999)).toBe(5000);
  });

  it('is what the wait loop actually asks for', () => {
    /*
     * WIRING, not behaviour - and worth saying so. The tests above pass
     * against a `waitBudgetMs` nothing calls: they pinned the helper while
     * the loop kept its hardcoded 5000, which is the exact shape of a green
     * test over a live bug.
     *
     * The behaviour itself is driven through the real loop in
     * `the-wait-measures-the-board-not-the-caller.test.ts`; this only keeps
     * the deadline consulting the command at all.
     */
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/amiga-emulation/api/AEDoorLibrary.ts'),
      'utf8',
    );

    expect(source).toMatch(/deadline = Date\.now\(\) \+ waitBudgetMs\(command\)/);
  });
});
