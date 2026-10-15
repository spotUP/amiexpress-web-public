/**
 * A SCREEN'S CODES SURVIVE ITS ART BEING REPLACED - AND ITS ROWS BEING DELETED.
 *
 * `Conf2/bull20.txt` was a bulletin that cleared the screen, drew, paused and
 * ran ctop: `~f`, art, `~SP`, `~CC_ctop`. The sysop loaded new ANSI over it and
 * saved, and the codes were gone - the screen still painted and the door
 * stopped running (2026-09-16).
 *
 * TWO CAUSES, one file. The carry's rule is "the upload wins": a replacement
 * carrying codes of its own is the whole truth and nothing is carried. The new
 * art's only code was a leading `~f` - the screen clear an ANSI editor writes
 * by itself - and that counted, so the real codes were dropped. And the editor
 * loads a file's rows onto a canvas, so the `~SP` and `~CC_ctop` rows were
 * characters a sysop could delete like any others: "i removed lines in the art,
 * did i remove codes? that should not be possible".
 *
 * These cases drive the real `planMciCarry` / `applyMciCarry` and the real
 * `splitScreenCodes`, on the shape that file actually had.
 */
process.env.SKIP_DB_INIT = '1';

import { planMciCarry, applyMciCarry, splitScreenCodes } from '../../src/screens/mci-carry';

/** The bulletin as it was: a clear, the drawing, a pause and a door. */
const OLD = ['~f', '  ART LINE ONE', '  ART LINE TWO', '~SP', '~CC_ctop'].join('\r\n');

/** What an ANSI editor exports: the drawing, with a clear on top and nothing else. */
const NEW_ART = ['~f', '  NEW ART ONE', '  NEW ART TWO', '  NEW ART THREE'].join('\r\n');

describe('replacing the art of a screen that carries codes', () => {
  it('carries the codes even though the new art brought its own clear', () => {
    const plan = planMciCarry(OLD, NEW_ART);

    expect(plan.uploadHasCodes).toBe(false);
    expect(plan.tail).toEqual(['~SP', '~CC_ctop']);
    expect(plan.lost).toEqual([]);
  });

  it('does not clear the screen twice - the upload already brought one', () => {
    const plan = planMciCarry(OLD, NEW_ART);
    expect(plan.head).toEqual([]);

    const written = applyMciCarry(NEW_ART, plan, 'above');
    expect((written.match(/~f/g) ?? []).length).toBe(1);
  });

  it('puts the pause and the door back around the new drawing', () => {
    const plan = planMciCarry(OLD, NEW_ART);
    const written = applyMciCarry(NEW_ART, plan, 'above');

    expect(written).toContain('NEW ART ONE');
    expect(written).toContain('~SP');
    expect(written).toContain('~CC_ctop');
    // The codes follow the art, which is where they were.
    expect(written.indexOf('NEW ART THREE')).toBeLessThan(written.indexOf('~CC_ctop'));
  });

  it('still lets a sysop take control by typing real codes into the upload', () => {
    // `~f` is furniture; anything else means the file is the whole truth.
    const typed = ['~f', '  ART', '~SS_BBS:Screens/other.txt'].join('\r\n');
    expect(planMciCarry(OLD, typed).uploadHasCodes).toBe(true);
    expect(planMciCarry(OLD, typed).tail).toEqual([]);
  });

  it('treats a repeat count and an upper-case clear as the same furniture', () => {
    for (const clear of ['~2f', '~F']) {
      const art = [clear, '  ART'].join('\r\n');
      expect(planMciCarry(OLD, art).uploadHasCodes).toBe(false);
    }
  });
});

describe('what the editor is handed', () => {
  it('keeps the codes out of the art, so the canvas cannot hold them', () => {
    const split = splitScreenCodes(OLD);

    expect(split.head).toEqual(['~f']);
    expect(split.tail).toEqual(['~SP', '~CC_ctop']);
    expect(split.art).toBe(['  ART LINE ONE', '  ART LINE TWO'].join('\r\n'));
    expect(split.art).not.toContain('~');
  });

  it('a screen with no codes hands over its whole self as art', () => {
    const plain = ['  JUST ART', '  MORE ART'].join('\r\n');
    const split = splitScreenCodes(plain);
    expect(split.head).toEqual([]);
    expect(split.tail).toEqual([]);
    expect(split.art).toBe(plain);
  });

  it('a file that is nothing but codes offers no art to edit', () => {
    const codesOnly = ['~f', '~SS_BBS:Screens/x.txt'].join('\r\n');
    const split = splitScreenCodes(codesOnly);
    expect(split.art).toBe('');
    expect(split.head).toEqual(['~f', '~SS_BBS:Screens/x.txt']);
  });

  it('DELETING EVERY ART ROW still cannot lose the codes', () => {
    // The sysop's case: the editor holds only the art, he removes rows, and
    // what comes back has no codes in it at all. The carry restores them.
    const edited = splitScreenCodes(OLD).art.split('\r\n').slice(0, 1).join('\r\n');
    const plan = planMciCarry(OLD, edited);
    const written = applyMciCarry(edited, plan, 'above');

    expect(written).toContain('~f');
    expect(written).toContain('~SP');
    expect(written).toContain('~CC_ctop');
  });
});
