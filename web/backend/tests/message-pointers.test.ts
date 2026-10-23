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
    // lastMsgReadConf bumped up to lowestNotDel (2). The overflow lands on
    // lowestKey (1), not 0.
    //
    // express.e does it in two steps and this port does it in one. There,
    // the conference-join validation writes 0 (express.e:5044,5048) and
    // searchNewMail turns a pointer of 0 into lowestKey before it scans
    // ("IF msgNum<=0 THEN lastNewReadConf:=msgNum:=mailStat.lowestKey",
    // express.e:11684, beside its own overflow clamp to lowestKey at
    // :11666). This backend has no read-time conversion, so a stored 0 would
    // be scanned as 0 and every message in the base would read as new -
    // which is the bug e15c4aed2 was fixing. Storing lowestKey here is the
    // same end state the Amiga reaches.
    expect(validated.lastMsgReadConf).toBe(2);
    expect(validated.lastNewReadConf).toBe(mailStat.lowestKey);
  });

  test('updateScanPointer advances lastNewReadConf to mailStat high', async () => {
    // A fresh board seeds no sysop (security F4), so make the caller here.
    const userId = await db.createUser({
      username: `ptr_${Date.now()}`, passwordHash: 'x', realname: 'p', location: '', phone: '', email: 'a@b.c',
      secLevel: 10, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
      timeTotal: 0, timeLimit: 60, timeUsed: 0, chatLimit: 30, chatUsed: 0,
      firstLogin: new Date(), lastLogin: new Date(), calls: 1, callsToday: 1, newUser: false, expert: 'N', ansi: true,
      linesPerScreen: 23, computer: 'AMiGA 500', screenType: 'ANSI', protocol: 'ZMODEM', editor: 'FULL', zoomType: 'NONE',
      availableForChat: true, quietNode: false, autoRejoin: 1, confAccess: 'XXX', areaName: '', uuCP: false,
      topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0,
    } as any);
    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('test user missing in test DB');
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
