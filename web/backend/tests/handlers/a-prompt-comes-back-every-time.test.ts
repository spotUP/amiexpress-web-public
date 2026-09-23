/**
 * "THE PROMPT JUMPS DOWN TO THE NEXT LINE SOMETIMES INSTEAD OF DRAWING A NEW
 * PROMPT" (the sysop, 2026-09-23).
 *
 * RETURN at the menu echoes `\r\n` first (`handleReadCommand`), and the
 * prompt is supposed to follow it. Two 500ms debounces stand in the way, both
 * added against duplicate renders from door-completion and state-transition
 * races: one on the menu SCREEN, which could be bypassed, and one on the
 * PROMPT, which could not. Press RETURN twice inside half a second and the
 * echo went out with nothing behind it - the cursor walked down a line and no
 * prompt was drawn. The faster he typed, the more of them piled up, which is
 * why the report read as random blank lines.
 *
 * A prompt the caller's own keystroke asked for is never a duplicate.
 */
process.env.SKIP_DB_INIT = '1';

import { promptDebounceBlocks } from '../../src/handlers/command-handler/menu';

const session = () => ({}) as any;

describe('the menu prompt a caller is waiting for', () => {
  it('is drawn again on a second RETURN inside the guard window', () => {
    const s = session();

    expect(promptDebounceBlocks(s, true, 1_000)).toBe(false);
    expect(promptDebounceBlocks(s, true, 1_100)).toBe(false);
  });

  it('is still guarded when nobody asked for it - a door finishing twice', () => {
    const s = session();

    expect(promptDebounceBlocks(s, false, 1_000)).toBe(false);
    expect(promptDebounceBlocks(s, false, 1_100)).toBe(true);
  });

  it('guards again once the window has passed', () => {
    const s = session();

    expect(promptDebounceBlocks(s, false, 1_000)).toBe(false);
    expect(promptDebounceBlocks(s, false, 1_600)).toBe(false);
  });

  it('keeps each caller\'s window to himself', () => {
    const a = session();
    const b = session();

    expect(promptDebounceBlocks(a, false, 1_000)).toBe(false);
    expect(promptDebounceBlocks(b, false, 1_050)).toBe(false);
  });
});
