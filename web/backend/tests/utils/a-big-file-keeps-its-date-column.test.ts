/**
 * A DIR line's size column, as express.e's formatFileSizeForDirList writes it
 * (express.e:18918-18940): `\r\d[7]` bytes, or - over 9,999,999 bytes with
 * CONVERT_TO_MB on the board's icon - `\r\d[4].\dM`, so the date stays at
 * column 23. The port wrote the raw bytes, which pushed the date to column
 * 24, and QuickNew never counted a big upload as new (live bbsConfig.info
 * carries CONVERT_TO_MB; byte-format audit 2026-10-04).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { formatFileSize, dirListSize } from '../../src/utils/file-upload.util';
import { buildDirEntryLine } from '../../src/utils/dir-file.util';

const BIG = 12406208; // 11.8 MB: 12406208>>20 = 11, (12406208 - 11<<20) / 104858 = 8

describe("express.e's size field", () => {
  it('is seven right-aligned digits up to 9,999,999 bytes', () => {
    expect(formatFileSize(89749)).toBe('  89749');
  });

  it('is the raw bytes above that without CONVERT_TO_MB, and MB with it', () => {
    expect(formatFileSize(BIG)).toBe('12406208');
    expect(formatFileSize(BIG, false, true)).toBe('  11.8M');
  });

  it('is KB under CREDITBYKB, and MB past 999,999K with CONVERT_TO_MB', () => {
    expect(formatFileSize(BIG, true)).toBe(' 12115K');
    const huge = 1_100_000 * 1024;
    expect(formatFileSize(huge, true)).toBe('1100000K');
    expect(formatFileSize(huge, true, true)).toBe('1074.2M');
  });
});

describe("the board's DIR line", () => {
  let root = '';
  let spy: jest.SpyInstance;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-size-'));
    const original = config.get.bind(config);
    spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  });
  afterEach(() => {
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps the date at column 23 for a big upload on a CONVERT_TO_MB board', () => {
    applyTooltypes(path.join(root, 'bbsConfig.info'), [['CONVERT_TO_MB', '1']]);
    expect(dirListSize(BIG)).toBe('  11.8M');
    const line = buildDirEntryLine('DL26-OMS.7z', BIG, new Date(2026, 9, 4), '/', 'N');
    expect(line.slice(0, 33)).toBe('DL26-OMS.7z  N  11.8M  10-04-26  ');
  });

  it('writes the raw bytes on a board without it', () => {
    expect(dirListSize(BIG)).toBe('12406208');
  });
});
