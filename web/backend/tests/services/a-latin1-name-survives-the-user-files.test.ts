/**
 * user.data / user.keys / user.misc are Amiga Latin-1. The manager read and
 * wrote their text fields as ASCII, which drops the high bit: "Björn" came
 * back as "Bj" + a different character, so looking a caller up by name - the
 * message system's findUserFromName, "User does not exist!!" - failed for
 * anyone with an accented letter in their name, real name or location.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserDatabaseManager } from '../../src/services/UserDatabaseManager';
import { UserFileManager } from '../../src/services/UserFileManager';

describe('the on-disk user files', () => {
  it('keep a Latin-1 name, real name and location', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'userfiles-'));
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = dir;
    try {
      const m = new UserDatabaseManager();
      m.initializeUserDatabase();
      const user = { username: 'Björn', realname: 'Åsa Öberg', location: 'Göteborg', secLevel: 20 };
      new UserFileManager().writeUserFiles(user as any, 1);
      const back = m.readUserFromDisk(1)!;
      expect(back.keys.userName).toBe('Björn');
      expect(back.user.name).toBe('Björn');
      expect(back.user.location).toBe('Göteborg');
      expect(back.misc.realName).toBe('Åsa Öberg');
    } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
