/**
 * A tooltype key reads as icon.library's FindToolType reads it.
 *
 * express.e reads every tooltype through FindToolType (tooltypes.e:152-174),
 * which matches the key as written: `#RESIDENT` is not RESIDENT, and an
 * FCheck icon's SOPTIONS is not OPTIONS. The parser used to strip a leading
 * `#`, `+`, `%` or `'` from every key because a damaged icon scraped byte by
 * byte leaks the low byte of each string's length in front of the key -
 * MGZLISTMAN.info's `+LOCATION` is 0x2B, the 43 bytes of its string and NUL.
 * That byte is now removed where it comes from, and only there: a text
 * .info has no lengths, so `DESCRIPTION=...` (68 bytes, 'D' = 68) keeps its D.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: { query: async () => ({ rows: [] }) },
}));

import { readTooltypeMap } from '../../src/utils/info-file.util';
import { fileCheckerFromTooltypes } from '../../src/utils/file-test.util';

const REPO = path.resolve(__dirname, '../../../..');

describe('a tooltype key reads as FindToolType reads it', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'findtooltype-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function textIcon(lines: string[]): Map<string, string> {
    const file = path.join(root, 'X.info');
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return readTooltypeMap(file);
  }

  it('reads the LOCATION of a damaged icon whose length byte leaks in front of it', () => {
    const map = readTooltypeMap(path.join(REPO, 'board', 'Doors/-mGs!-MGZListMan/MGZLISTMAN.info'));
    expect(map.get('LOCATION')).toBe('DOORS:-mgs!-MgzListMan/MGZLISTMAN');
    expect(map.has('+LOCATION')).toBe(false);
  });

  it('keeps the first letter of a text key whose code equals its length', () => {
    const value = 'x'.repeat(68 - 'DESCRIPTION='.length);
    const map = textIcon([`DESCRIPTION=${value}`]);
    expect(map.get('DESCRIPTION')).toBe(value);
  });

  it('reads #RESIDENT as its own key, not as RESIDENT', () => {
    const map = textIcon(['#RESIDENT', 'TYPE=XIM']);
    expect(map.has('RESIDENT')).toBe(false);
    expect(map.has('#RESIDENT')).toBe(true);
  });

  it('reads an FCheck icon as checkFileExternal does: OPTIONS, never SOPTIONS', () => {
    const map = textIcon(['CHECKER=/usr/local/bin/check', 'SOPTIONS=ADVERT=x', 'ERROR.1=infected', 'ERROR.2=corrupted']);
    expect(fileCheckerFromTooltypes('ZIP', map)).toMatchObject({
      checker: '/usr/local/bin/check',
      options: '',
      errors: ['infected', 'corrupted'],
      stackSize: 4096,
    });
  });

  it('gives an icon with no CHECKER no checker', () => {
    expect(fileCheckerFromTooltypes('TXT', textIcon(['ERROR.1=Archive Corrupted!!!']))).toBeNull();
  });
});
