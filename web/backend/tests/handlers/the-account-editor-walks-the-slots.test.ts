/**
 * The account editor's + and - walk the accounts by slot.
 *
 * express.e editInfo(which,...) edits user.data slot `which`; + is
 * which:=which+1 and wraps to 1 past the last record, - is which:=which-1 and
 * wraps to findLastAccount() below 1 (express.e:21263-21286, 21075-21083).
 * The board kept the account's database UUID as the slot, so `+` computed
 * "uuid" + 1 and called db.getUserBySlot, which does not exist: + and - only
 * ever printed "Error loading user", and the header showed the UUID.
 *
 * Driven from the editor's entry (handleEditUserAccount) and its key handler.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

// user.data: three records, the board's truth.
const DISK = ['sysop', 'alice', 'bob'];
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: {
    readUserBySlot: (slot: number) => {
      const name = ['sysop', 'alice', 'bob'][slot - 1];
      return name ? { username: name, slotNumber: slot, secLevel: 10 * slot } : null;
    },
  },
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: { getUserCount: () => 3 },
}));
// The rows, keyed by name, each with its UUID.
const rows = new Map(DISK.map((name, i) => [name, { id: `uuid-${name}`, username: name, slotNumber: i + 1 }]));
(globalThis as any).__acctRows = rows;
jest.mock('../../src/database', () => ({
  db: {
    // What requiring the board touches at load (index.ts wires its services).
    getConfigRepository: () => ({}),
    getUserByUsername: async (name: string) => (globalThis as any).__acctRows.get(name) ?? null,
    getUserBySlotNumber: async (slot: number) =>
      [...(globalThis as any).__acctRows.values()].find((r: any) => r.slotNumber === slot) ?? null,
  },
}));

import { db } from '../../src/database';
import { handleEditUserAccount, setDatabase } from '../../src/handlers/user/account.handler';
import { handleAccountEditInput } from '../../src/handlers/user/account-edit-input.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';

const settle = () => new Promise((r) => setTimeout(r, 30));

async function editorOn(username: string) {
  setDatabase(db);
  const out: string[] = [];
  const socket: any = { id: `acct-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT, nodeId: 1,
    user: { id: 1, username: 'sysop', secLevel: 255 },
  };
  handleEditUserAccount(socket, session, username);
  await settle();
  const key = async (k: string) => { out.length = 0; await handleAccountEditInput(socket, session, k); await settle(); };
  return { out, session, key };
}

describe('the account editor', () => {
  it('opens on the account\'s slot, not its database id', async () => {
    const e = await editorOn('alice');
    expect(e.session.tempData.editingSlot).toBe(2);
    expect(e.out.join('')).toContain('Slot #2');
  });

  it('+ goes to the next slot, and past the last back to slot 1', async () => {
    const e = await editorOn('alice');
    await e.key('+');
    expect(e.session.tempData.editingSlot).toBe(3);
    expect(e.session.tempData.editingUser.username).toBe('bob');
    expect(e.session.tempData.editingUser.id).toBe('uuid-bob');
    expect(e.out.join('')).toContain('Slot #3');

    await e.key('+');
    expect(e.session.tempData.editingSlot).toBe(1);
    expect(e.session.tempData.editingUser.username).toBe('sysop');
  });

  it('- goes to the previous slot, and below 1 to the last account', async () => {
    const e = await editorOn('alice');
    await e.key('-');
    expect(e.session.tempData.editingSlot).toBe(1);
    await e.key('-');
    expect(e.session.tempData.editingSlot).toBe(3);
    expect(e.session.tempData.editingUser.username).toBe('bob');
    expect(e.out.join('')).not.toContain('Error loading user');
  });
});
