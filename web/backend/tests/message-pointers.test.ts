import { Database } from '../src/database';
import { ConfigManager } from '../src/config';
import {
  loadMsgPointers,
  saveMsgPointers,
  validatePointers,
  updateScanPointer,
  getMailStatFile
} from '../src/utils/message-pointers.util';

describe('Message pointers parity', () => {
  let db: Database;
  let config: ConfigManager;

  beforeAll(() => {
    db = (global as any).testDb;
    config = new ConfigManager();
    if (!db) throw new Error('Test database not initialized');
  });

  test('validatePointers clamps to bounds and zeroes on overflow', async () => {
    const mailStat = { lowestKey: 1, highMsgNum: 5, lowestNotDel: 2 };
    const base = {
      userId: 'u1',
      conferenceId: 1,
      messageBaseId: 1,
      lastNewReadConf: 10,
      lastMsgReadConf: 0,
      scanFlags: 0,
      messagesPosted: 0,
      newSinceDate: new Date(),
      bytesDownload: 0,
      bytesUpload: 0,
      upload: 0,
      downloads: 0
    };
    const validated = validatePointers(base, mailStat);
    // lastMsgReadConf bumped up to lowestNotDel (2), lastNewReadConf reset to 0 because > high
    expect(validated.lastMsgReadConf).toBe(2);
    expect(validated.lastNewReadConf).toBe(0);
  });

  test('updateScanPointer advances lastNewReadConf to mailStat high', async () => {
    // use sysop defaults created in test setup
    const user = await db.getUserByUsername('sysop');
    expect(user).toBeTruthy();
    if (!user) {
      throw new Error('sysop user missing in test DB');
    }
    const confId = 1;
    const msgBaseId = 1;
    // ensure mail stats exist
    const mailStatBefore = await getMailStatFile(confId, msgBaseId);
    expect(mailStatBefore.highMsgNum).toBeGreaterThan(0);

    const before = await loadMsgPointers(user.id, confId, msgBaseId);
    await updateScanPointer(user.id, confId, msgBaseId, mailStatBefore.highMsgNum);
    const after = await loadMsgPointers(user.id, confId, msgBaseId);

    expect(after.lastNewReadConf).toBe(mailStatBefore.highMsgNum);
    // lastMsgReadConf remains unchanged by scan updates
    expect(after.lastMsgReadConf).toBe(before.lastMsgReadConf);
  });
});
