/**
 * express.e saveFlagged (2798-2829): prints "** AutoSaving File Flags **" and
 * rings the bell, deletes Partdownload/dump<slot> and flagged<slot> (or
 * dump<node>-<slot> / flagged<node>-<slot> when the sysop sets ownPartFiles),
 * then writes "<conf> <file>" lines when the list is not empty. The port
 * ignored ownPartFiles (load and save both) and printed nothing.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileFlagManager, AUTOSAVE_FLAGS_BANNER } from '../../src/utils/file-flag.util';
import { config } from '../../src/config';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveflagged-'));
const part = (n: string) => path.join(dir, 'Partdownload', n);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
afterEach(() => jest.restoreAllMocks());

const ownPartFiles = (on: boolean) =>
  jest.spyOn(config, 'get').mockImplementation(((k: string) => (k === 'ownPartFiles' ? on : undefined)) as never);

test('saving writes flagged<slot> and deletes dump<slot>', async () => {
  ownPartFiles(false);
  fs.mkdirSync(path.join(dir, 'Partdownload'), { recursive: true });
  fs.writeFileSync(part('dump7'), 'OLD.LHA');
  const fm = new FileFlagManager(dir, 7, 3);
  fm.addFlag('A.LHA', 2);
  await fm.save();
  expect(fs.readFileSync(part('flagged7'), 'utf-8')).toBe('2 A.LHA\n');
  expect(fs.existsSync(part('dump7'))).toBe(false);
});

test('with ownPartFiles the files are flagged<node>-<slot> and dump<node>-<slot>, and load reads them back', async () => {
  ownPartFiles(true);
  fs.writeFileSync(part('dump3-7'), 'OLD.LHA');
  const fm = new FileFlagManager(dir, 7, 3);
  fm.addFlag('B.LHA', 4);
  await fm.save();
  expect(fs.readFileSync(part('flagged3-7'), 'utf-8')).toBe('4 B.LHA\n');
  expect(fs.existsSync(part('dump3-7'))).toBe(false);
  const again = new FileFlagManager(dir, 7, 3);
  await again.load();
  expect(again.getCount()).toBe(1);
});

test('an empty list deletes the old flagged file and writes none', async () => {
  ownPartFiles(false);
  fs.writeFileSync(part('flagged7'), '2 A.LHA\n');
  await new FileFlagManager(dir, 7, 3).save();
  expect(fs.existsSync(part('flagged7'))).toBe(false);
});

test('the banner names the autosave and rings the bell', () => {
  expect(AUTOSAVE_FLAGS_BANNER).toBe('\r\n** AutoSaving File Flags **\r\n\x07');
});
