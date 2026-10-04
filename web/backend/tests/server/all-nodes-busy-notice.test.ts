/**
 * The "all nodes are busy" notice is ASCII.
 *
 * Its rules were U+2501 box glyphs - not drawable on an Amiga or C64
 * terminal, and against the board's ASCII-only output rule. Web drew its own
 * copy of the text as well; both now come from allNodesBusyNotice
 * (invented-text audit 2026-10-04).
 */
import { allNodesBusyNotice } from '../../src/server/session-manager';

describe('allNodesBusyNotice', () => {
  it('is plain ASCII with ANSI colour, nothing above 0x7E', () => {
    const notice = allNodesBusyNotice();
    expect(/[^\x00-\x7e]/.test(notice)).toBe(false);
    expect(notice).toContain('Sorry, all nodes are busy.');
    expect(notice).toContain('-'.repeat(36));
  });
});
