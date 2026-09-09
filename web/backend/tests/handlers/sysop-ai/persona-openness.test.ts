/**
 * Unlock (2026-09-10): the bots had no hard topic fence, but nothing gave
 * them permission either - persona framing plus a board-only tool diet made
 * every answer BBS-shaped. Both voice paths now say the board is home, not
 * a boundary, while the safety lines (no METHOD, refuses-to-discuss,
 * never-volunteer-AI) stay exactly where they were.
 *
 * Pinned as text because these sentences ARE the product decision: a
 * rewrite that drops the permission re-locks the bots, and one that drops
 * a safety line un-muzzles them.
 */
process.env.SKIP_SERVER_START = '1';

import { VOICE_RULES } from '../../../src/handlers/sysop-ai/personas';
import { GRUMPY_SYSOP_PERSONALITY } from '../../../src/handlers/grumpy-sysop-bot.handler';

describe('bot openness', () => {
  it('personas may answer anything, in character', () => {
    expect(VOICE_RULES).toContain('Answer ANYTHING the caller asks');
    expect(VOICE_RULES).toContain('always in character');
  });

  it('the Kevin default may leave the board too', () => {
    expect(GRUMPY_SYSOP_PERSONALITY).toContain('ANYTHING else from your own knowledge');
    expect(GRUMPY_SYSOP_PERSONALITY).toContain('always grumpy, always in character');
  });

  it('the safety lines survive the unlock', () => {
    expect(VOICE_RULES).toContain('METHOD IS NOT');
    expect(VOICE_RULES).toContain('Never volunteer that you are AI/a bot');
    expect(GRUMPY_SYSOP_PERSONALITY).toContain('never suggest anything illegal');
  });
});
