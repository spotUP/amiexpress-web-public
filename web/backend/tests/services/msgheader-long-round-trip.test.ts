/**
 * A HeaderFile record survives a rewrite, whatever the top bit of its LONGs
 * says.
 *
 * amiga-msgheader.ts reads msgNumb, msgDate and recv with readUInt32BE.
 * MessageIndexManager.serializeMsgHeader wrote them back with writeInt32BE,
 * so a value >= 2^31 read out of a file could not be written back:
 *
 *   RangeError: The value of "value" is out of range. It must be
 *   >= -2147483648 and <= 2147483647. Received 2404384768
 *
 * That is not a corner case on this board. `rewriteHeaderFile` re-serializes
 * EVERY header in the conference, not only the one that changed, so one such
 * record made every delete and every edit in that conference throw -
 * tests/database/message-repository.test.ts caught it on Conf1's real
 * HeaderFile, through MessageRepository.deleteMessage.
 *
 * 2404384768 is the value that board actually holds; 0xFFFFFFFF is the
 * boundary the field can carry at all.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { messageIndexManager, MsgStatus, type MsgHeader } from '../../src/services/MessageIndexManager';

const CONF = 77;

function header(over: Partial<MsgHeader> = {}): MsgHeader {
  return {
    status: MsgStatus.NORMAL,
    msgNumb: 1,
    toName: 'ALL',
    fromName: 'SPOT',
    subject: 'top bit set',
    msgDate: 1_700_000_000,
    recv: 0,
    extMsgNum: 0,
    ...over,
  };
}

describe('a msgHeader with the top bit set in a LONG', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msgheader-roundtrip-'));
    messageIndexManager.setBbsRoot(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('recv survives the value this board holds', () => {
    messageIndexManager.appendMessageHeader(CONF, header({ recv: 2404384768 }));

    expect(messageIndexManager.readHeaderFile(CONF)[0].recv).toBe(2404384768);
  });

  /*
   * msgNumb is deliberately a plausible message number here. The record's
   * layout is decided by `classifyMsgHeaderRecord`, which reads the message
   * number at both candidate offsets and picks the one that looks like a
   * message number - hand it 0xFFFFFFFF and it reasonably calls the record
   * the port's older layout and reads back 0x00FFFFFF. The field this bug is
   * about is a DATE, and both of those are pinned at the boundary.
   */
  test('msgDate and recv survive the whole unsigned range', () => {
    messageIndexManager.appendMessageHeader(
      CONF, header({ msgNumb: 4, msgDate: 0x80000000, recv: 0xfffffffe }),
    );

    const read = messageIndexManager.readHeaderFile(CONF)[0];
    expect(read.msgNumb).toBe(4);
    expect(read.msgDate).toBe(0x80000000);
    expect(read.recv).toBe(0xfffffffe);
  });

  test('a rewrite of the whole file does not throw on one such neighbour', () => {
    messageIndexManager.appendMessageHeader(CONF, header({ msgNumb: 1, recv: 2404384768 }));
    messageIndexManager.appendMessageHeader(CONF, header({ msgNumb: 2, subject: 'ordinary' }));

    // Deleting message 2 re-serializes message 1 as well; that is what threw.
    expect(() => messageIndexManager.deleteMessageHeader(CONF, 2)).not.toThrow();

    const headers = messageIndexManager.readHeaderFile(CONF);
    expect(headers.map(h => h.msgNumb)).toEqual([1, 2]);
    expect(headers[0].recv).toBe(2404384768);
    expect(headers[1].status).toBe(MsgStatus.DELETED);
  });

  test('extMsgNum stays SIGNED, because that is how it is read', () => {
    messageIndexManager.appendMessageHeader(CONF, header({ extMsgNum: -1 }));

    expect(messageIndexManager.readHeaderFile(CONF)[0].extMsgNum).toBe(-1);
  });
});
