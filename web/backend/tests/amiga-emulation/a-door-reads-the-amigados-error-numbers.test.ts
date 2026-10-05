/**
 * A door's IoErr() must be the number AmigaOS gives: a door that compares it
 * to ERROR_WRITE_PROTECTED, or prints it through Fault(), got 214 (which the
 * NDK calls ERROR_DISK_WRITE_PROTECTED) for a write-protected file, and nine
 * codes from 214 to 227 were shuffled the same way. The table is checked
 * against the NDK headers themselves, not against a copy of its own values.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DOS_ERRORS } from '../../src/amiga-emulation/api/dos/dos-types';

const NDK = path.resolve(__dirname, '../../../../sdk/68k/ndk-includes/dos');

function headerErrors(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of ['dos.h', 'dosasl.h']) {
    const text = fs.readFileSync(path.join(NDK, file), 'latin1');
    for (const m of text.matchAll(/^#define\s+(ERROR_\w+)\s+(\d+)/gm)) out.set(m[1], Number(m[2]));
  }
  return out;
}

test('every AmigaDOS error number a door can read matches the NDK header', () => {
  const ndk = headerErrors();
  expect(ndk.get('ERROR_WRITE_PROTECTED')).toBe(223);
  const wrong = Object.entries(DOS_ERRORS)
    .filter(([name]) => name !== 'ERROR_NO_ERROR')
    .filter(([name, value]) => ndk.get(name) !== value)
    .map(([name, value]) => `${name}=${value} (NDK ${ndk.get(name) ?? 'none'})`);
  expect(wrong).toEqual([]);
});

test('a write-protected file reports ERROR_WRITE_PROTECTED through the file manager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { FileManager } = require('../../src/amiga-emulation/api/FileManager') as any;
  const fm = new FileManager('/nonexistent-root', { amiToSysPath: () => null });
  expect(fm.mapNodeErrorToAmigaDOS({ code: 'EACCES' })).toBe(223);
  expect(fm.mapNodeErrorToAmigaDOS({ code: 'ENOENT' })).toBe(205);
});
