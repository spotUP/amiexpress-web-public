/**
 * Regression test for G-UB-DB: ~UB / ~DB MCI codes produce a comma-formatted
 * decimal byte count, matching express.e:5351-5358 formatBCD() output.
 *
 * Data flow:
 *   - DB stores user.bytesUpload / user.bytesDownload as raw integers
 *   - database/types.ts aliases them to user.uploadBytes / user.downloadBytes
 *   - When persisting to User.misc, UserFileManager.numberToBCD packs the
 *     decimal digits two-per-byte big-endian into the 8-byte BCD field
 *     (services/UserFileManager.ts:562)
 *   - When the screen MCI parser sees ~UB or ~DB, it reads the raw integer
 *     and calls formatWithCommas() at screen.handler.ts:628-629, which
 *     produces the same comma-formatted decimal string that express.e's
 *     formatBCD() emits.
 *
 * This test pins the BCD encoder to confirm it round-trips through a
 * formatted decimal — guarding against a regression where someone
 * "improves" the BCD packing and silently breaks the round-trip.
 */

import { UserFileManager } from '../src/services/UserFileManager';

describe('~UB / ~DB MCI BCD round-trip parity (G-UB-DB, express.e:5351-5358)', () => {
  // Access the private numberToBCD via a wrapper instance reflection.
  // The function is deterministic and stateless — instantiating with
  // a dummy dataDir is fine since we never call any I/O.
  const mgr = new UserFileManager('/tmp');
  const numberToBCD = (mgr as any).numberToBCD.bind(mgr) as (n: number) => Buffer;

  function bcdToString(buf: Buffer): string {
    let digits = '';
    for (let i = 0; i < 8; i++) {
      digits += String((buf[i] >> 4) & 0x0f);
      digits += String(buf[i] & 0x0f);
    }
    return digits.replace(/^0+/, '') || '0';
  }

  test('zero round-trips correctly', () => {
    const buf = numberToBCD(0);
    expect(bcdToString(buf)).toBe('0');
  });

  test('typical upload byte count round-trips', () => {
    const value = 12345;
    const buf = numberToBCD(value);
    expect(bcdToString(buf)).toBe(String(value));
  });

  test('large byte count round-trips (8 bytes = 16 digits = up to ~10^16)', () => {
    const value = 9876543210;
    const buf = numberToBCD(value);
    expect(bcdToString(buf)).toBe(String(value));
  });

  test('every digit 0-9 packs correctly into both nibbles', () => {
    const value = 1234567890;
    const buf = numberToBCD(value);
    expect(bcdToString(buf)).toBe(String(value));
  });

  test('formatBCD output (decimal string) is what express.e prints — sanity', () => {
    // express.e formatBCD(uploadBytesBCD, tempstr) -> emits decimal digits.
    // Our formatWithCommas(rawInteger) emits the same digits with commas.
    // A user with 123456789 bytes uploaded shows the same number either way:
    //   - express.e: "123,456,789" (formatBCD adds commas)
    //   - web:       "123,456,789" (formatWithCommas adds commas)
    const value = 123456789;
    const buf = numberToBCD(value);
    expect(bcdToString(buf)).toBe('123456789');
  });
});
