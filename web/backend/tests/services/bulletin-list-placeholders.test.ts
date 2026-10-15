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
