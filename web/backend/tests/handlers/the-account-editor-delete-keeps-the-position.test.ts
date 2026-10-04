/**
 * DELETE in the account editor (express.e:21362-21373) marks the RECORD, at
 * the position the account keeps:
 *
 *   hoozer.slotNumber:=0; hoozer2.number:=0
 *   saveAccount(hoozer,hoozer2,hoozer3,which,1)
 *
 * The port set the row's slotnumber - the position - to 0 instead. The disk
 * write skips slot 0, so user.data never heard of the deletion, and the
 * startup backfill handed the row a new slot: the account logged in again
 * after the next restart. RE-ACTIVATE (21374-21378) puts the field back.
 */
// The editor saves through the module's `db`; point it at this run's test
// database once that exists (tests/setup.ts), the real module's before.
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return {
    ...actual,
    db: new Proxy({}, {
      get(_target, prop) {
        const target = (global as any).testDb ?? actual.db;
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

const deleteConfAccess = jest.fn();
jest.mock('../../src/services/delete-conf-access', () => {
  const actual = jest.requireActual('../../src/services/delete-conf-access');
  return { ...actual, deleteConfAccess: (...a: unknown[]) => { deleteConfAccess(...a); return actual.deleteConfAccess(...a); } };
});

import { handleAccountEditInput } from '../../src/handlers/user/account-edit-input.handler';
import { userFileManager } from '../../src/services/UserFileManager';
import { BBSState, LoggedOnSubState } from '../../src/index';

async function waitForTestDb(): Promise<any> {
  for (let i = 0; i < 30 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 500));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

async function makeAccount(db: any): Promise<any> {
  const id = await db.createUser({
    username: `deleteme_${Date.now()}`, passwordHash: 'h', realname: 'Del Me', location: 'X', phone: '',
    email: '', secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0,
    ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    lastLogin: null, firstLogin: new Date(), calls: 0, callsToday: 0, newUser: false, expert: 'N',
    ansi: true, linesPerScreen: 23, computer: '', screenType: '', protocol: '', editor: '',
    zoomType: '', availableForChat: false, quietNode: false, autoRejoin: 1, confAccess: 'XX',
    areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
  });
  await db.appendUserToDisk(id);
  return db.getUserById(id);
}

function editor(user: any) {
  const out: string[] = [];
  const socket: any = { id: `acct-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {} };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT,
    nodeId: 1,
    user: { id: 'sysop', username: 'sysop', secLevel: 255 },
    tempData: { accountEditing: true, editingUser: user, editingSlot: user.id, page: 0, changes: false },
  };
  return { out, socket, session, key: (k: string) => handleAccountEditInput(socket, session, k) };
}

describe('DELETE in the account editor', () => {
  let db: any;
  beforeAll(async () => { db = await waitForTestDb(); }, 30000);

  it('zeroes the record\'s slot field at the position it keeps, survives a restart, and RE-ACTIVATE undoes it', async () => {
    const account = await makeAccount(db);
    const position = account.slotNumber;
    expect(position).toBeGreaterThan(0);

    await editor(account).key('DELETE');
    // deleteConfAccess (express.e:21370) runs for the account's own slot.
    expect(deleteConfAccess).toHaveBeenCalledWith(expect.any(String), position, 'Conf.DB');

    // The record, where it was, is deleted.
    const record = userFileManager.readUserBySlot(position)!;
    expect(record.username).toBe(account.username);
    expect(record.accountDeleted).toBe(true);
    // The row keeps the position.
    expect((await db.getUserById(account.id)).slotNumber).toBe(position);

    // A restart's backfill does not hand it a new slot, so nothing revives it.
    await (db as any).runMigrations();
    expect((await db.getUserById(account.id)).slotNumber).toBe(position);
    expect(userFileManager.readUserBySlot(position)!.accountDeleted).toBe(true);

    // RE-ACTIVATE, then save.
    const again = editor(await db.getUserById(account.id));
    await again.key('9');
    await again.key('~');
    expect(userFileManager.readUserBySlot(position)!.accountDeleted).toBe(false);
  });
});
