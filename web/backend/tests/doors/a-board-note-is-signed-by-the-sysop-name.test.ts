/**
 * A note the board writes with no caller is signed with the board's sysop name.
 *
 * BBSApi.addUserNote fell back to the literal username 'sysop' for the author,
 * and the live board has had no account called sysop since 2026-09-28 - the
 * sysop's account is spot, and the board's configured name is "Spot".
 */
process.env.SKIP_DB_INIT = '1';

const written: Array<{ slot: number; author: string }> = [];
jest.mock('../../src/utils/user-notes.util', () => ({
  ...jest.requireActual('../../src/utils/user-notes.util'),
  appendUserNote: (slot: number, author: string) => { written.push({ slot, author }); return true; },
}));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  ...jest.requireActual('../../src/services/bbs-config-file.service'),
  getBoardConfig: () => ({ sysop_name: 'Spot' }),
}));

jest.mock('../../src/database', () => ({
  ...jest.requireActual('../../src/database'),
  db: { getUserByUsername: async () => ({ slotNumber: 7 }) },
}));

import { BBSApi } from '../../src/doors/BBSApi';

it('signs a no-caller note with the configured sysop name', async () => {

  const api = new BBSApi({ emit: () => true } as any, { nodeId: 1 } as any);
  await api.addUserNote('model', 'checked by the board');

  expect(written).toEqual([{ slot: 7, author: 'Spot' }]);
});
