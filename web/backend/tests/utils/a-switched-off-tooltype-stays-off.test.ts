/**
 * A tooltype the sysop switched off stays off.
 *
 * express.e reads every tooltype through icon.library's FindToolType
 * (tooltypes.e:152-174), which matches the key as written. The board's
 * FCheck icons switch checkers off by renaming the key - `&CHECKER`,
 * `SOPTIONS`, `%ERROR.1`, `*ERROR.2` - and a door icon does the same with
 * `+LOCATION`. The port stripped `#`, `+`, `%` and `'` from every key, and
 * the file checker loaders also stripped `&` and read SOPTIONS as OPTIONS, so
 * checkers the sysop had disabled were run.
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

describe('a switched-off tooltype stays off', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'switched-off-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function icon(lines: string[]): Map<string, string> {
    const file = path.join(root, 'X.info');
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return readTooltypeMap(file);
  }

  it('reads +LOCATION as its own key, not as LOCATION', () => {
    const map = icon(['+LOCATION=DOORS:MGZ/MGZLISTMAN', 'TYPE=XIM']);
    expect(map.has('LOCATION')).toBe(false);
    expect(map.get('+LOCATION')).toBe('DOORS:MGZ/MGZLISTMAN');
  });

  it('gives an FCheck icon with only &CHECKER no checker', () => {
    const map = icon(['&CHECKER=DOORS:multi-check/mULTI-cHECK', 'ERROR.1=Archive Corrupted!!!']);
    expect(fileCheckerFromTooltypes('LHA', map)).toBeNull();
  });

  it('reads neither SOPTIONS nor a %- or *-marked ERROR.n', () => {
    const map = icon([
      'CHECKER=/usr/local/bin/check',
      'SOPTIONS=ADVERT=x',
      '%ERROR.1=Archive corrupted --aborting',
      '*ERROR.2=Operation not entirely successful',
    ]);
    const checker = fileCheckerFromTooltypes('LZA', map);
    expect(checker).not.toBeNull();
    expect(checker!.options).toBe('');
    expect(checker!.errors).toEqual([]);
  });

  it('still reads the plain keys', () => {
    const map = icon(['CHECKER=/usr/local/bin/check', 'OPTIONS=-t', 'ERROR.1=infected', 'ERROR.2=corrupted']);
    const checker = fileCheckerFromTooltypes('ZIP', map);
    expect(checker).toMatchObject({ checker: '/usr/local/bin/check', options: '-t', errors: ['infected', 'corrupted'] });
  });
});
