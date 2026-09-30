/**
 * The read pointer is checked against the conference's MailStats FILE.
 *
 * express.e's getMailStatFile (8672-8707) reads MailStats from disk, and the
 * board writes that file as it saves messages. The port read a `mail_stats`
 * DB table that nothing kept current - on live it held highMsgNum 1 for a
 * conference whose MailStats said 267 - so every join's validatePointers
 * rewound the caller to the lowest message and ten EALL messages were
 * offered as new at every login (sysop, 2026-09-30).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { getMailStatFile, validatePointers } from '../../src/utils/message-pointers.util';
import { updateMessageNumberRange } from '../../src/server/database-helpers';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mailstats-file-'));

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  messageIndexManager.writeMailStats(1, { lowestKey: 255, highMsgNum: 267, lowestNotDel: 255, pad: Buffer.alloc(6) });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function pointer(lastNewReadConf: number) {
  return {
    userId: 'u1', conferenceId: 1, messageBaseId: 1, lastNewReadConf, lastMsgReadConf: 0, scanFlags: 0,
    messagesPosted: 0, newSinceDate: new Date(), bytesDownload: 0, bytesUpload: 0, upload: 0, downloads: 0,
  };
}

describe('the read pointer and the MailStats file', () => {
  it('reads the conference MailStats from disk', async () => {
    expect(await getMailStatFile(1, 1)).toEqual({ lowestKey: 255, highMsgNum: 267, lowestNotDel: 255 });
  });

  it('keeps a pointer that is inside the file\'s range', async () => {
    expect(validatePointers(pointer(266), await getMailStatFile(1, 1)).lastNewReadConf).toBe(266);
  });

  it('CM writes the numbers it edits into the same file', async () => {
    expect(await updateMessageNumberRange(1, 1, undefined, 300)).toBe(true);
    expect(messageIndexManager.readMailStats(1)?.highMsgNum).toBe(300);
    expect((await getMailStatFile(1, 1)).highMsgNum).toBe(300);
  });
});
