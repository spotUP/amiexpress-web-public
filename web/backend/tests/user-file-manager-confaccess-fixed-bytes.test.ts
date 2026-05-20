/**
 * Regression: conferenceAccess[10] in the AmiExpress UserFileStruct is
 * a 10-byte access bitmap (each byte 'X' = access, '_' = no access),
 * NOT a C-style null-terminated string. All 10 positions are
 * meaningful flags.
 *
 * UserFileManager.writeString reserves byte N-1 for a null terminator,
 * which loses position 10's flag — a user granted access to confs
 * 1..10 would write 9 X's + null, and when read back via
 * readConfAccessFromDisk position 10 always shows as '_'.
 *
 * Bug surfaced 2026-05-20 during the live-vs-localhost confaccess
 * investigation. door.handler.ts now reads SQLite-first (commit
 * 731f63f20) so user-visible behaviour is correct, but the binary
 * write path needs the same parity fix so future binary readers (mtop,
 * other 68K doors, any tool that reads user.data directly) see the
 * full access map.
 *
 * Grep-style — UserFileManager.ts requires the BBS subsystem.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('UserFileManager writes conferenceAccess as 10 fixed bytes (no null terminator carve-out)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'UserFileManager.ts'),
    'utf8'
  );

  test('writeFixedBytes helper exists', () => {
    expect(src).toMatch(/private writeFixedBytes\(buffer: Buffer, offset: number, str: string, maxLen: number\): number/);
  });

  test('writeFixedBytes does NOT subtract 1 for a null terminator', () => {
    // writeString trims to maxLen-1; writeFixedBytes must use maxLen.
    const m = src.match(/private writeFixedBytes\([^)]*\)\s*:\s*number\s*\{([\s\S]*?)\n  \}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/substring\(\s*0\s*,\s*maxLen\s*\)/);
    expect(m![1]).not.toMatch(/maxLen\s*-\s*1/);
  });

  test('serializeUserStruct routes conferenceAccess through writeFixedBytes', () => {
    expect(src).toMatch(
      /writeFixedBytes\(buffer,\s*offset,\s*struct\.conferenceAccess,\s*10\)/
    );
  });

  test('serializeUserStruct does NOT route conferenceAccess through writeString anymore', () => {
    // Specifically: there's no writeString call with struct.conferenceAccess.
    expect(src).not.toMatch(/writeString\(buffer,\s*offset,\s*struct\.conferenceAccess/);
  });

  test('writeString still keeps the null-terminator carve-out for proper string fields (name/pass/location/phone)', () => {
    // Other string fields are C-style; writeString must remain the path
    // for them.
    expect(src).toMatch(/private writeString\(buffer: Buffer, offset: number, str: string, maxLen: number\): number/);
    const m = src.match(/private writeString\([^)]*\)\s*:\s*number\s*\{([\s\S]*?)\n  \}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/maxLen\s*-\s*1/);
  });
});
