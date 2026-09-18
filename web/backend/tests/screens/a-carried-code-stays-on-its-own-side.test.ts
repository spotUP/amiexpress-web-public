/**
 * A CODE MEANS WHAT IT MEANS BECAUSE OF WHERE IT IS.
 *
 * "i can only select to keep the codes over or under when i replace, that will
 * not work, they need to be kept where they are in the logo i replace" (sysop,
 * 2026-09-18). `~f` clears the screen BEFORE the logo; `~SP` pauses AFTER it.
 * Moving either to the other end of the file changes what the screen does.
 *
 * The carry has always put the head block back above and the tail below - the
 * placement was just called `above`, which reads as "all of them on top". It
 * is `keep` now, and the old spelling still works because a browser holding
 * the previous admin bundle sends it.
 */
import { planMciCarry, applyMciCarry } from '../../src/screens/mci-carry';

const OLD = [
  '~f',
  '\x1b[36mTHE OLD LOGO',
  '~SP',
  '~CC_ctop',
  '~XISUBSCAN',
  '',
].join('\r\n');

const NEW_ART = '\x1b[35mTHE NEW LOGO\r\n';

const linesOf = (text: string) => text.split('\r\n');

describe('a carried code stays on the side it was written on', () => {
  it('keeps the head above the art and the tail below it', () => {
    const written = applyMciCarry(NEW_ART, planMciCarry(OLD, NEW_ART), 'keep');
    const lines = linesOf(written);

    expect(lines[0]).toBe('~f');
    expect(lines[1]).toBe('\x1b[35mTHE NEW LOGO');
    expect(lines.slice(2, 5)).toEqual(['~SP', '~CC_ctop', '~XISUBSCAN']);
  });

  it('`above` is the same thing under its old name', () => {
    const plan = planMciCarry(OLD, NEW_ART);

    expect(applyMciCarry(NEW_ART, plan, 'above')).toBe(applyMciCarry(NEW_ART, plan, 'keep'));
  });

  it('`below` is the other choice, and it really does move them', () => {
    const lines = linesOf(applyMciCarry(NEW_ART, planMciCarry(OLD, NEW_ART), 'below'));

    // A tilde still opens the file: the board parses codes only when the first
    // line starts with one, so a carry that put everything below has to.
    expect(lines[0]).toBe('~');
    expect(lines[1]).toBe('\x1b[35mTHE NEW LOGO');
    expect(lines.slice(2, 6)).toEqual(['~f', '~SP', '~CC_ctop', '~XISUBSCAN']);
  });
});
