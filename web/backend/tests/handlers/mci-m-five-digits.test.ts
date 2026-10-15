/**
 * `~M` never exceeds five digits.
 *
 * express.e:5321 prints the posted-message count as
 * `StringF(tempstr,'\d',loggedOnUser.messagesPosted AND $FFFF)` - the same
 * 16-bit mask `~TC` carries at express.e:5309. Our dispatch
 * (`mci-dispatch.ts`, the `M:` entry both flavours share) printed the raw
 * number, so a user who posted past 65535 messages rendered a six-, seven-
 * or nine-digit value where the sysop's screen budgeted five.
 *
 * Sibling of `mci-tc-five-digits.test.ts`, which pins the same invariant for
 * `~TC` and carries the 40-column render proof; the two masks were found
 * together and regress together.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/SystemStatsService', () => ({
  systemStats: { getTodayCalls: () => 3 },
}));

jest.mock('../../src/database', () => ({
  db: {
    getMessageBases: jest.fn(async () => []),
    getUsers: jest.fn(async () => []),
  },
}));

import type { BBSSession } from '../../src/index';
import type { MciFlavour } from '../../src/handlers/mci-dispatch';
import { buildMciDispatch, MCI_SENTINELS } from '../../src/handlers/mci-dispatch';

function session(messagesPosted: number): BBSSession {
  return {
    petsciiMode: false,
    nodeId: 1,
    currentConf: 0,
    currentConfName: 'Amiga',
    timeRemaining: 3600,
    user: { id: 7, username: 'Spot', secLevel: 30, messagesPosted },
  } as unknown as BBSSession;
}

async function renderM(flavour: MciFlavour, messagesPosted: number): Promise<string> {
  const { dispatch } = await buildMciDispatch(session(messagesPosted), {
    flavour,
    inlineMode: false,
    sentinels: MCI_SENTINELS,
  });
  // -1 is express.e's "no width prefix" (`~M` with no digits).
  return dispatch.M(-1) ?? '';
}

const FLAVOURS: MciFlavour[] = ['ansi', 'petscii'];

describe('~M never exceeds five digits (express.e:5321, AND $FFFF)', () => {
  it.each(FLAVOURS)('%s: a six-digit message count is masked to five digits', async (flavour) => {
    const rendered = await renderM(flavour, 123456);
    expect(rendered).toBe(String(123456 & 0xffff));
    expect(rendered).toHaveLength(5);
  });

  it.each(FLAVOURS)('%s: a nine-digit message count is masked to five digits', async (flavour) => {
    const rendered = await renderM(flavour, 123456789);
    expect(rendered).toBe(String(123456789 & 0xffff));
    expect(rendered.length).toBeLessThanOrEqual(5);
  });

  it.each(FLAVOURS)('%s: a count inside the mask is printed unchanged', async (flavour) => {
    expect(await renderM(flavour, 0)).toBe('0');
    expect(await renderM(flavour, 42)).toBe('42');
    expect(await renderM(flavour, 65535)).toBe('65535');
  });

  it.each(FLAVOURS)('%s: no message count can render a sixth digit', async (flavour) => {
    for (const count of [65536, 99999, 100000, 999999, 1000000, 123456789, 4294967295]) {
      const rendered = await renderM(flavour, count);
      expect(rendered.length).toBeLessThanOrEqual(5);
      expect(rendered).toMatch(/^\d{1,5}$/);
    }
  });

  it.each(FLAVOURS)('%s: a missing count is still zero, not NaN', async (flavour) => {
    const { dispatch } = await buildMciDispatch(
      { user: { id: 7, username: 'Spot' }, timeRemaining: 60 } as unknown as BBSSession,
      { flavour, inlineMode: false, sentinels: MCI_SENTINELS },
    );
    expect(dispatch.M(-1)).toBe('0');
  });
});
