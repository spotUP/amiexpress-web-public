/**
 * express.e send017 (5210-5216): one 0x0F byte, sent before sendCLS when the
 * sysop's editor opens an account (checkNEdit 22395). The port skipped it
 * ("a web terminal has no character set") although the board's own teletext
 * art shifts out with 0x0E and closes with 0x0F. PETSCII gets none.
 * Driven from editAccounts, the 1 command's entry: "5" opens account 5.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

const answers: string[] = [];
jest.mock('../../src/utils/await-input', () => ({
  ...jest.requireActual('../../src/utils/await-input'),
  lineInput: async () => answers.shift() ?? '',
  holdInput: async (_s: unknown, _st: unknown, fn: () => Promise<unknown>) => fn(),
  takeTypeAhead: () => [],
}));
jest.mock('../../src/handlers/user/account.handler', () => ({ editInfo: async () => 0 }));
jest.mock('../../src/handlers/user/account-edit-input.handler', () => ({
  loadAccountAt: async (slot: number) => ({ username: 'u', slotNumber: slot }),
  lastAccountSlot: () => 9,
  writeAccount: jest.fn(),
  creditMaintenance: jest.fn(),
  presetOntoAccount: jest.fn(),
}));

import { editAccounts } from '../../src/handlers/user/user-editor.handler';

async function open(petscii: boolean): Promise<string> {
  const out: string[] = [];
  const socket: any = {
    id: 'ed', session: { petsciiMode: petscii },
    emit: (_e: string, t: unknown) => out.push(String(t)), on() {}, off() {}, removeListener() {},
  };
  const session: any = { user: { username: 'sysop', secLevel: 255 }, nodeId: 1 };
  answers.push('5', '');
  await editAccounts(socket, session);
  return out.join('');
}

test('opening account 5 sends 0x0F then the clear screen', async () => {
  const text = await open(false);
  expect(text).toContain('\x0f\x1b[2J');
});

test('a PETSCII caller gets no 0x0F', async () => {
  const text = await open(true);
  expect(text).not.toContain('\x0f');
});
