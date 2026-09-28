/**
 * Regression test for G-FF: ~FF flagged-files MCI output matches the
 * character output of express.e showFlaggedFiles(maxLen).
 *
 * express.e:2830-2853 showFlaggedFiles(maxLen):
 *   - emits filenames separated by single spaces
 *   - if maxLen > 0, truncates so total chars emitted <= maxLen
 *   - if maxLen = -1, emits full list
 *   - decrements maxLen as it emits each space and filename; stops when no room
 *
 * Our implementation pipes the value through the shared MCI tokenizer
 * (`src/utils/mci-tokenizer.util.ts`) via the `FF` entry of the ONE dispatch
 * table, which moved out of `screen.handler.ts` into
 * `src/handlers/mci-dispatch.ts` when the PETSCII `.seq` renderer started
 * sharing it.
 *
 * Pinned by behaviour only: driven through buildMciDispatch, the entry
 * emits the space-separated join, a width truncates it, and the C64 flavour
 * shares the definition. (The source-shape pins that used to back these up
 * asserted the same three things by spelling, and were removed.)
 */

process.env.SKIP_DB_INIT = '1';

jest.mock('../src/services/SystemStatsService', () => ({
  systemStats: { getTodayCalls: () => 0 },
}));

jest.mock('../src/database', () => ({
  db: {
    getMessageBases: jest.fn(async () => []),
    getUsers: jest.fn(async () => []),
  },
}));

import { buildMciDispatch, MCI_SENTINELS } from '../src/handlers/mci-dispatch';
import { flaggedFilesManager } from '../src/services/FlaggedFilesManager';

describe('~FF flagged-files MCI output (G-FF, express.e:5439-5441 / 2830-2853)', () => {
  const FF_USER_ID = 90210;

  beforeAll(() => {
    flaggedFilesManager.addFile(FF_USER_ID, {
      fileName: 'alpha.lha', filePath: '/tmp/alpha.lha', fileSize: 1,
    });
    flaggedFilesManager.addFile(FF_USER_ID, {
      fileName: 'beta.lha', filePath: '/tmp/beta.lha', fileSize: 2,
    });
  });

  async function ffEntry(flavour: 'ansi' | 'petscii' = 'ansi') {
    const { dispatch } = await buildMciDispatch(
      { user: { id: FF_USER_ID }, timeRemaining: 0, currentConf: 0, nodeId: 1 },
      { flavour, inlineMode: false, sentinels: MCI_SENTINELS },
    );
    return dispatch.FF;
  }

  test('the FF entry emits the space-separated join at runtime', async () => {
    const FF = await ffEntry();
    expect(FF(-1)).toBe('alpha.lha beta.lha');
  });

  test('a width truncates it, express.e maxLen>0 style', async () => {
    const FF = await ffEntry();
    expect(FF(9)).toBe('alpha.lha');
  });

  test('the C64 flavour shares the same definition', async () => {
    const ansi = await ffEntry('ansi');
    const petscii = await ffEntry('petscii');
    expect(petscii(-1)).toBe(ansi(-1));
  });
});
