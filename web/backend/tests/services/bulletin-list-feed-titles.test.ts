import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listBulletins } from '../../src/services/bulletin-list';
import { NEWS_BULLETIN_SOURCES, feedBulletinTitle } from '../../src/services/news-bulletins';

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bullfeed-'));
  fs.mkdirSync(path.join(dataDir, 'Bulletins'));
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const put = (name: string, body: string) => fs.writeFileSync(path.join(dataDir, 'Bulletins', name), body);
const list = () => listBulletins(dataDir, path.join(dataDir, 'Conf1', 'Screens'));

test('a feed bulletin with no Bulls.CFG name is titled from its feed definition, not "Bulletin N"', () => {
  put('bull33.txt', 'x');
  put('bull7.txt', 'x');
  put('bull40.txt', 'x');
  const titles = Object.fromEntries(list().map((b) => [b.number, b.title]));
  expect(titles[33]).toBe('r/Amiga');
  expect(titles[7]).toBe('SVT Text news headlines');
  expect(titles[40]).toBe('r/ANSI - text art');
});

test('every feed definition resolves through the lookup, and a number no feed owns stays "Bulletin N"', () => {
  for (const s of NEWS_BULLETIN_SOURCES) {
    const n = Number(/bull(\d+)\.txt/.exec(s.file)![1]);
    expect(feedBulletinTitle(n)).toBe(s.title);
  }
  put('bull17.txt', 'x');
  expect(feedBulletinTitle(17)).toBeUndefined();
  expect(list()[0].title).toBe('Bulletin 17');
});

test('a Bulls.CFG name still wins over the feed title', () => {
  fs.mkdirSync(path.join(dataDir, 'Doors', 'emp_tools'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'Doors', 'emp_tools', 'Bulls.CFG'),
    '[Init_END]\nSysop Reddit                    ; bull33.txt\n[BullNames_END]\n',
  );
  put('bull33.txt', 'x');
  put('bull34.txt', 'x');
  const titles = Object.fromEntries(list().map((b) => [b.number, b.title]));
  expect(titles[33]).toBe('Sysop Reddit');
  expect(titles[34]).toBe('r/reverseengineering');
});
