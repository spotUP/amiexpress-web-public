/**
 * A user edit made on the database side has to reach user.data.
 *
 * The admin lists users from BOTH stores - an account with a slot comes back
 * as `user-<slot>`, an imported one as a database UUID - and only the first
 * branch of PUT /users/:id wrote the disk record. user.data is what express.e
 * and every runtime consumer read, so editing a database-side user reported
 * success while the board kept the old location, security level and time
 * limit. The password report was this same split in the other direction.
 *
 * What must NOT happen is the fix: mirroring a whole `User` from the database
 * back through the fixed-width record is how -TCB!- was destroyed. The
 * database does not faithfully hold every field the record has, so the ones
 * it does not hold get written over good values. The record is read FROM DISK
 * and only the edited fields are applied.
 */

process.env.SKIP_DB_INIT = '1';

const readAllUsers = jest.fn();
const readUserBySlot = jest.fn();
const updateUserDataFile = jest.fn();

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: {
    readAllUsers: (...args: unknown[]) => readAllUsers(...args),
    readUserBySlot: (...args: unknown[]) => readUserBySlot(...args),
    updateUserDataFile: (...args: unknown[]) => updateUserDataFile(...args),
  },
}));

import { applyUserEditsToDisk } from '../../src/api/user-edits-to-disk';

/** A record with fields the DATABASE does not hold, which must survive. */
function diskRecord(overrides: Record<string, unknown> = {}) {
  return {
    username: 'Phantasm',
    location: 'nEVERLaND',
    secLevel: 30,
    timeLimit: 60,
    // None of these come back from the database, and all of them are real
    // bytes in the record.
    uploads: 412,
    downloads: 1908,
    messagesPosted: 77,
    confAccess: 'XXXXXXXXXX',
    ...overrides,
  };
}

describe('a database-side user edit', () => {
  beforeEach(() => {
    readAllUsers.mockReset();
    readUserBySlot.mockReset();
    updateUserDataFile.mockReset();
    readAllUsers.mockReturnValue([{ username: 'Phantasm', slotNumber: 7 }]);
    readUserBySlot.mockReturnValue(diskRecord());
  });

  it('reaches the disk record', () => {
    const outcome = applyUserEditsToDisk('Phantasm', { location: 'uPTOWN', secLevel: 255 });

    expect(outcome.slotNumber).toBe(7);
    expect(updateUserDataFile).toHaveBeenCalledTimes(1);

    const [written, slot] = updateUserDataFile.mock.calls[0];
    expect(slot).toBe(7);
    expect(written.location).toBe('uPTOWN');
    expect(written.secLevel).toBe(255);
  });

  // The -TCB!- guard, stated as a test.
  it('keeps every field the edit did not name', () => {
    applyUserEditsToDisk('Phantasm', { location: 'uPTOWN' });

    const [written] = updateUserDataFile.mock.calls[0];
    expect(written.uploads).toBe(412);
    expect(written.downloads).toBe(1908);
    expect(written.messagesPosted).toBe(77);
    expect(written.confAccess).toBe('XXXXXXXXXX');
    expect(written.timeLimit).toBe(60);
  });

  it('reads the record from disk, not from the caller', () => {
    applyUserEditsToDisk('Phantasm', { location: 'uPTOWN' });

    // The values written must have come through readUserBySlot. If a future
    // change passes a database User in instead, this is what notices.
    expect(readUserBySlot).toHaveBeenCalledWith(7);
  });

  // A rename changes the key the slot is found by, so the lookup has to use
  // the name the account had BEFORE the edit or the record stops being
  // maintained and silently drifts.
  it('finds the slot by the name the account had before the rename', () => {
    const outcome = applyUserEditsToDisk('Phantasm', { username: 'Phantasm2' });

    expect(outcome.slotNumber).toBe(7);
    const [written] = updateUserDataFile.mock.calls[0];
    expect(written.username).toBe('Phantasm2');
  });

  it('matches the slot without regard to case', () => {
    readAllUsers.mockReturnValue([{ username: 'PHANTASM', slotNumber: 3 }]);
    readUserBySlot.mockReturnValue(diskRecord({ username: 'PHANTASM' }));

    expect(applyUserEditsToDisk('phantasm', { location: 'x' }).slotNumber).toBe(3);
  });

  it('writes nothing when the edit names no disk field', () => {
    // A database-only field - the record has no place for it.
    applyUserEditsToDisk('Phantasm', {} as never);

    expect(updateUserDataFile).not.toHaveBeenCalled();
  });

  // An imported account need not have a slot, and inventing one would put a
  // stranger into a numbered position express.e reads by index.
  it('leaves an account with no disk record alone', () => {
    readAllUsers.mockReturnValue([{ username: 'SomeoneElse', slotNumber: 1 }]);

    const outcome = applyUserEditsToDisk('Phantasm', { location: 'uPTOWN' });

    expect(outcome.slotNumber).toBeNull();
    expect(updateUserDataFile).not.toHaveBeenCalled();
  });

  it('carries the password hash so the disk copy does not keep the old one', () => {
    applyUserEditsToDisk('Phantasm', { passwordHash: '$2a$10$newhash' });

    const [written] = updateUserDataFile.mock.calls[0];
    expect(written.passwordHash).toBe('$2a$10$newhash');
  });
});

describe('the route that owns both stores', () => {
  it('carries a database-branch edit to disk', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'api', 'config-routes.ts'),
      'utf8',
    );

    // The database branch must call it, and with the name from BEFORE the
    // update - the whole point of capturing beforeUpdate.
    expect(source).toContain('applyUserEditsToDisk(beforeUpdate?.username');
  });
});
