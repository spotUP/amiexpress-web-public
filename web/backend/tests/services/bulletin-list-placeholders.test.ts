import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listBulletins } from '../../src/services/bulletin-list';

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulllist-'));
  fs.mkdirSync(path.join(dataDir, 'Bulletins'));
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const put = (name: string, body: string) => fs.writeFileSync(path.join(dataDir, 'Bulletins', name), body);

test('lists only bulletins that have something to read: empty, blank and missing ones are not offered', () => {
  put('bull1.txt', 'Top Uploaders\r\n');
  put('bull2.txt', '');
  put('bull3.txt', '  \r\n\r\n');
  put('bull4.txt', '\x1b[0m\x1b[32m \r\n');
  put('bull6.txt', 'Last Callers');
  expect(listBulletins(dataDir, path.join(dataDir, 'Conf1', 'Screens')).map((b) => b.number)).toEqual([1, 6]);
});

describe('the BULLETINS catalogue over a real board', () => {
  jest.isolateModules(() => undefined);
  test('every file empty: the catalogue refuses with the board\'s own "none" answer, no empty grid', () => {
    put('BullHelp.txt', 'help');
    put('bull1.txt', '');
    put('bull2.txt', '\r\n  ');
    const { config } = require('../../src/config');
    jest.spyOn(config, 'get').mockImplementation(((k: string) => (k === 'dataDir' ? dataDir : undefined)) as never);
    const { bulletinsMenuSource } = require('../../src/services/menu-catalogue/sources/bulletins');
    const { buildCatalogue } = require('../../src/services/menu-catalogue/build');
    const { defaultMenuConfig } = require('../../src/screens/menu-config/menu-config');
    const caller: any = { secLevel: 10, conference: 1, node: 1, columns: 80, rows: 25, displayMode: 'ansi', may: () => true, isSysop: false, widthRefuses: () => false, overflowPref: '' };
    expect(buildCatalogue(bulletinsMenuSource, caller, defaultMenuConfig('BULLETINS'))).toEqual({ refusal: 'none' });
    put('bull3.txt', 'something');
    const built: any = buildCatalogue(bulletinsMenuSource, caller, defaultMenuConfig('BULLETINS'));
    expect(built.sections[0].entries.map((e: any) => e.key)).toEqual(['3']);
  });
});
