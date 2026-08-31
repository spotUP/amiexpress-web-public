/**
 * Removing a conference from the middle of the board.
 *
 * The old delete refused anything but the last conference. The refusal was
 * honest about the constraint - a conference IS a position, express.e:8506
 * reads `user.conferenceAccess[confNum-1]`, so closing a gap moves what every
 * account can reach - but it left the sysop stuck: removing conference 3 of
 * 14 meant removing eleven others first.
 *
 * Renumbering is safe only if EVERYTHING keyed by position moves together, so
 * that is what these tests are about: the list, the icons, every account's
 * access string, the per-user read pointers and the Amiga-side Conf.DB, all
 * shifted by the same one, and the conference's files only touched when the
 * caller actually asked.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import {
  ConferenceRemovalService,
  removeAccessPosition,
} from '../../src/services/conference-removal.service';

function makeBoard(conferences: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-remove-'));
  const lines = [`NCONFS=${conferences}`];
  for (let i = 1; i <= conferences; i += 1) {
    lines.push(`NAME.${i}=Conference ${i}`);
    lines.push(`LOCATION.${i}=BBS:Conf${i}`);
  }
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
  for (let i = 1; i <= conferences; i += 1) {
    fs.writeFileSync(path.join(root, `Conf${i}.info`), `NDIRS=1\nCONF=${i}\n`);
    fs.mkdirSync(path.join(root, `Conf${i}`, 'MsgBase'), { recursive: true });
    fs.writeFileSync(path.join(root, `Conf${i}`, 'MsgBase', '1'), `a message in ${i}`);
  }
  return root;
}

/** A user file that records what was written back to it. */
function makeUsers(access: string[]) {
  const users = access.map((confAccess, index) => ({ slotNumber: index, confAccess }));
  return {
    users,
    readAllUsers: () => users.map((u) => ({ ...u })),
    updateUserDataFile: jest.fn((user: { confAccess?: string }, slot: number) => {
      users[slot].confAccess = user.confAccess ?? '';
    }),
  };
}

/** Records the SQL the migration runs, so the shift can be asserted. */
function makeSqlite(userRows: Array<{ id: number; confaccess: string }> = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const statements: string[] = [];
  return {
    calls,
    statements,
    exec: (sql: string) => {
      statements.push(sql);
      return undefined;
    },
    prepare: (sql: string) => ({
      run: (...params: unknown[]) => {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return { changes: 0 };
      },
      all: () => (sql.includes('FROM users') ? userRows.map((r) => ({ ...r })) : []),
    }),
  };
}

describe('removing a conference from the middle', () => {
  let root: string;

  beforeEach(() => { root = makeBoard(14); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('closes the gap in ConfConfig.info', async () => {
    const service = new ConferenceRemovalService(root);

    const result = await service.remove(3);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(result.nconfs).toBe(13);
    expect(result.renumbered).toBe(true);
    expect(after.get('NCONFS')).toBe('13');
    // 1 and 2 untouched, 3 onwards pulled down by one, 14 gone.
    expect(after.get('NAME.1')).toBe('Conference 1');
    expect(after.get('NAME.2')).toBe('Conference 2');
    expect(after.get('NAME.3')).toBe('Conference 4');
    expect(after.get('LOCATION.3')).toBe('BBS:Conf4');
    expect(after.get('NAME.13')).toBe('Conference 14');
    expect(after.has('NAME.14')).toBe(false);
    expect(after.has('LOCATION.14')).toBe(false);
  });

  it('moves the icons, because Conf<n>.info is named by position', async () => {
    const service = new ConferenceRemovalService(root);

    await service.remove(3);

    // Conference 4's icon is now conference 3's.
    expect(readTooltypeMap(path.join(root, 'Conf3.info')).get('CONF')).toBe('4');
    expect(readTooltypeMap(path.join(root, 'Conf13.info')).get('CONF')).toBe('14');
    expect(fs.existsSync(path.join(root, 'Conf14.info'))).toBe(false);
  });

  it('moves every account\'s access with it, so nobody gains a conference', async () => {
    const users = makeUsers([
      'XXXXXXXXXX',   // everything
      'XX_X______',   // 1, 2 and 4
      '__________',   // nothing
    ]);
    const service = new ConferenceRemovalService(root, { users });

    const result = await service.remove(3);

    expect(result.usersMigrated).toBe(2);
    // The all-access user keeps access to what is left, and gains nothing.
    expect(users.users[0].confAccess).toBe('XXXXXXXXX_');
    // The second user could reach 1, 2 and 4; 4 is now 3.
    expect(users.users[1].confAccess).toBe('XXX_______');
    // Nothing to move.
    expect(users.users[2].confAccess).toBe('__________');
  });

  it('moves every mirror table keyed by conference, not just one', async () => {
    const sqlite = makeSqlite();
    const service = new ConferenceRemovalService(root, { sqlite });

    await service.remove(3);

    // Six tables reference conferences(id), and the conferences row itself.
    // Shifting only conf_base left the deleted conference in the mirror,
    // where everything that reads it went on offering it.
    for (const [table, column] of [
      ['message_bases', 'conferenceid'],
      ['messages', 'conferenceid'],
      ['file_areas', 'conferenceid'],
      ['bulletins', 'conferenceid'],
      ['mail_stats', 'conference_id'],
      ['conf_base', 'conference_id'],
    ]) {
      const deleted = sqlite.calls.find((c) => c.sql === `DELETE FROM ${table} WHERE ${column} = ?`);
      const shifted = sqlite.calls.find(
        (c) => c.sql === `UPDATE ${table} SET ${column} = ${column} - 1 WHERE ${column} > ?`
      );
      expect(deleted?.params).toEqual([3]);
      expect(shifted?.params).toEqual([3]);
    }

    expect(
      sqlite.calls.find((c) => c.sql === 'DELETE FROM conferences WHERE id = ?')?.params
    ).toEqual([3]);
    expect(
      sqlite.calls.find((c) => c.sql === 'UPDATE conferences SET id = id - 1 WHERE id > ?')?.params
    ).toEqual([3]);
  });

  it('shifts the mirror\'s access strings at their own width, not capped at ten', async () => {
    // user.data is CHAR[10], but the mirror holds NCONFS-wide strings: this
    // board has fourteen conferences and every account carries fourteen
    // characters. The first version capped the shifted string at ten and
    // silently took conferences 11-14 from everyone.
    const sqlite = makeSqlite([
      { id: 1, confaccess: 'XXXXXXXXXXXXXX' },  // 14 wide, everything
      { id: 2, confaccess: 'XX_X__________' },  // 1, 2 and 4
      { id: 3, confaccess: 'XX' },              // shorter than the position: untouched
    ]);
    const service = new ConferenceRemovalService(root, { sqlite });

    await service.remove(3);

    const updates = sqlite.calls.filter((c) => c.sql === 'UPDATE users SET confaccess = ? WHERE id = ?');
    expect(updates.map((u) => u.params)).toEqual([
      ['XXXXXXXXXXXXX_', 1],
      ['XXX___________', 2],
    ]);
  });

  it('moves them together, with the foreign keys deferred until commit', async () => {
    const sqlite = makeSqlite();
    const service = new ConferenceRemovalService(root, { sqlite });

    await service.remove(3);

    // Foreign keys are ON, so parent and children cannot move one at a time.
    expect(sqlite.statements).toEqual([
      'BEGIN IMMEDIATE',
      'PRAGMA defer_foreign_keys = ON',
      'COMMIT',
    ]);
  });

  it('splices the slot out of the Amiga-side conference list', async () => {
    const confDb = { removeSlot: jest.fn() };
    const service = new ConferenceRemovalService(root, { confDb });

    await service.remove(3);

    // Conf.DB is indexed from zero, so conference 3 is slot 2.
    expect(confDb.removeSlot).toHaveBeenCalledWith(2);
  });

  it('copies everything it is about to change', async () => {
    const service = new ConferenceRemovalService(root);

    const { backupDir } = await service.remove(3);

    expect(fs.existsSync(path.join(backupDir, 'ConfConfig.info'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'Conf3.info'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'Conf14.info'))).toBe(true);
    // And the copy is the state from BEFORE the shift.
    expect(readTooltypeMap(path.join(backupDir, 'Conf3.info')).get('CONF')).toBe('3');
    expect(readTooltypeMap(path.join(backupDir, 'ConfConfig.info')).get('NCONFS')).toBe('14');
  });
});

describe('the conference\'s files', () => {
  let root: string;

  beforeEach(() => { root = makeBoard(14); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('stay unless the sysop asked, and the path is reported', async () => {
    const service = new ConferenceRemovalService(root);

    const result = await service.remove(3);

    expect(fs.existsSync(path.join(root, 'Conf3', 'MsgBase', '1'))).toBe(true);
    expect(result.keptOnDisk).toBe(path.join(root, 'Conf3'));
    expect(result.filesRemoved).toBeNull();
  });

  it('go when the switch is on', async () => {
    const service = new ConferenceRemovalService(root);

    const result = await service.remove(3, { removeFiles: true });

    expect(fs.existsSync(path.join(root, 'Conf3'))).toBe(false);
    expect(result.filesRemoved).toBe(path.join(root, 'Conf3'));
    expect(result.keptOnDisk).toBeNull();
  });

  it('are matched by LOCATION, not by the number - the directory does not move', async () => {
    const service = new ConferenceRemovalService(root);

    await service.remove(3, { removeFiles: true });

    // Conference 3 is now what used to be 4, and it still lives in BBS:Conf4.
    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('LOCATION.3')).toBe('BBS:Conf4');
    expect(fs.existsSync(path.join(root, 'Conf4', 'MsgBase', '1'))).toBe(true);
  });

  it('refuses to delete a directory that is another conference\'s home', async () => {
    // Numbers renumber and directories stay put, so two LOCATION.n lines can
    // name one directory. This board's conference 12 lived in BBS:Conf13/; a
    // new conference 13 was handed the same directory by its number, and the
    // switch destroyed conference 12's messages and files.
    fs.writeFileSync(
      path.join(root, 'ConfConfig.info'),
      'NCONFS=3\nNAME.1=One\nLOCATION.1=BBS:Conf1\nNAME.2=Beavis\nLOCATION.2=BBS:Conf3\nNAME.3=test\nLOCATION.3=BBS:Conf3\n'
    );
    const service = new ConferenceRemovalService(root);

    const result = await service.remove(3, { removeFiles: true });

    expect(result.filesRemoved).toBeNull();
    expect(result.keptOnDisk).toBe(path.join(root, 'Conf3'));
    expect(fs.existsSync(path.join(root, 'Conf3', 'MsgBase', '1'))).toBe(true);
  });

  it('refuses a LOCATION that points outside the board', async () => {
    fs.writeFileSync(
      path.join(root, 'ConfConfig.info'),
      'NCONFS=2\nNAME.1=One\nLOCATION.1=BBS:../../etc\nNAME.2=Two\nLOCATION.2=BBS:Conf2\n'
    );
    const service = new ConferenceRemovalService(root);

    await expect(service.remove(1, { removeFiles: true })).rejects.toThrow(/not inside the BBS root/);
  });
});

describe('what it still refuses', () => {
  let root: string;

  beforeEach(() => { root = makeBoard(2); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('a conference that does not exist', async () => {
    const service = new ConferenceRemovalService(root);
    await expect(service.remove(9)).rejects.toThrow(/does not exist/);
  });

  it('the last conference standing', async () => {
    const service = new ConferenceRemovalService(root);
    await service.remove(2);
    await expect(service.remove(1)).rejects.toThrow(/at least one conference/);
  });
});

describe('the access shift itself', () => {
  it('removes that position and pads with no-access', () => {
    expect(removeAccessPosition('XXXXXXXXXX', 3)).toBe('XXXXXXXXX_');
    expect(removeAccessPosition('XX_X______', 3)).toBe('XXX_______');
    expect(removeAccessPosition('X_________', 1)).toBe('__________');
  });

  it('keeps the width when the string on disk was short', () => {
    expect(removeAccessPosition('XXX', 2)).toBe('XX________');
  });

  it('leaves a position past the end alone', () => {
    expect(removeAccessPosition('XXX', 40)).toBe('XXX_______');
  });
});
