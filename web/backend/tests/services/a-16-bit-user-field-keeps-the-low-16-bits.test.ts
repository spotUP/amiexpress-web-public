/**
 * An INT field of user.data / user.keys holds what express.e puts in it: the
 * low 16 bits of the value (an E INT store truncates). The writer clamped to
 * 32767 instead, so a 57600 baud logon came out as 32767 on 46 of 47 live
 * accounts, and any counter past 32767 (calls, uploads, CPS) froze there
 * instead of wrapping as it does on the Amiga.
 */
process.env.SKIP_DB_INIT = '1';

import { UserFileManager } from '../../src/services/UserFileManager';

describe('a 16-bit user field keeps the low 16 bits, as express.e stores it', () => {
  const ufm = new UserFileManager();

  it('writes 40000 calls as 0x9C40, not 32767', () => {
    const rec = ufm.deserializeUserStruct(Buffer.alloc(ufm.USER_STRUCT_SIZE));
    rec.timesCalled = 40000;
    rec.uploads = 70000;
    const back = ufm.deserializeUserStruct(ufm.serializeUserStruct(rec));
    expect(back.timesCalled & 0xffff).toBe(40000);
    expect(back.uploads & 0xffff).toBe(70000 & 0xffff);
  });

  it('still writes a value inside the signed range unchanged', () => {
    const rec = ufm.deserializeUserStruct(Buffer.alloc(ufm.USER_STRUCT_SIZE));
    rec.timesCalled = 1234;
    rec.secStatus = -1;
    const back = ufm.deserializeUserStruct(ufm.serializeUserStruct(rec));
    expect(back.timesCalled).toBe(1234);
    expect(back.secStatus).toBe(-1);
  });
});
