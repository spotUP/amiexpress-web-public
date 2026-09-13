/**
 * pwdLastUpdated is WHEN THE PASSWORD WAS LAST CHANGED, and every login
 * rewrote it to now.
 *
 * The misc builder fills it from `user.updated`, which the database bumps on
 * every write - and a login writes (lastLogin, calls, timeUsed). So the field
 * tracked "when this record was last touched", the password was permanently
 * a few seconds old, and an expiry policy could never fire. A 68K door
 * reading user.misc was told the same untruth.
 *
 * Only a real password change moves it (updateUserMiscAfterPasswordChange,
 * express.e:29828-29829), so the on-disk value stands unless a caller names
 * an explicit one. Exactly the rule the lockout bytes beside it already
 * follow - it was simply left out of that list.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../../src/services/UserFileManager';
import type { User } from '../../src/database';

process.env.SKIP_DB_INIT = '1';

const MISC_REC = 248;
/** Record-relative offset of the pwdLastUpdated LONG, after the three lock CHARs. */
const OFF_PWD_UPDATED = 0x96;

function dbUser(username: string, updated: Date): User {
  return {
    id: `id-${username}`, username, realname: username, location: 'nowhere', phone: '000',
    secLevel: 30, slotNumber: 1, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    timeTotal: 0, timeLimit: 60, timeUsed: 0, calls: 1, callsToday: 1, expert: false,
    ansi: true, linesPerScreen: 23, confAccess: 'X-------------------------',
    created: new Date('2026-01-01T00:00:00Z'), updated,
    lastLogin: updated,
  } as unknown as User;
}

function board(): { root: string; mgr: UserFileManager } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pwdage-'));
  const saved = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  try {
    return { root, mgr: new UserFileManager() };
  } finally {
    if (saved === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = saved;
  }
}

const pwdStamp = (root: string): number =>
  fs.readFileSync(path.join(root, 'user.misc')).readInt32BE(OFF_PWD_UPDATED);

describe('the password age', () => {
  const roots: string[] = [];
  afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

  it('survives a login that touched the record', () => {
    const { root, mgr } = board();
    roots.push(root);

    // The password was changed in January, and the stamp says so.
    const changed = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000);
    mgr.updateUserDataFile({ ...dbUser('dalton', new Date('2026-01-01T00:00:00Z')), pwdLastUpdated: changed } as User, 1);
    expect(pwdStamp(root)).toBe(changed);

    // Eight months later the caller logs in: the database bumps `updated`,
    // and the sync must not read that as a password change.
    mgr.updateUserDataFile(dbUser('dalton', new Date('2026-09-13T20:00:00Z')), 1);

    expect(pwdStamp(root)).toBe(changed);
  });

  it('moves when the password actually changes', () => {
    const { root, mgr } = board();
    roots.push(root);

    const first = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000);
    const second = Math.floor(Date.parse('2026-09-13T20:00:00Z') / 1000);
    mgr.updateUserDataFile({ ...dbUser('dalton', new Date()), pwdLastUpdated: first } as User, 1);
    mgr.updateUserDataFile({ ...dbUser('dalton', new Date()), pwdLastUpdated: second } as User, 1);

    expect(pwdStamp(root)).toBe(second);
  });

  it('takes the record`s own time when there is nothing on disk yet', () => {
    const { root, mgr } = board();
    roots.push(root);

    const updated = new Date('2026-03-04T05:06:07Z');
    mgr.updateUserDataFile(dbUser('newcomer', updated), 1);

    // A brand new account has no prior stamp; its own write time is the
    // honest answer, and it is not zero.
    expect(pwdStamp(root)).toBe(Math.floor(updated.getTime() / 1000));
  });
});
