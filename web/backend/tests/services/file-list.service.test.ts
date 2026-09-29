/**
 * The one place a conference's file lists are edited (admin file-manager
 * plan, P1b). FM calls it with the line its search found; the admin site
 * calls it by filename - that path is pinned here.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { setStorageContext } from '../../src/storage/storage-context';
import { deleteEntry, descriptionLinesOf, findEntryLines, listEntries, moveEntry } from '../../src/services/file-list.service';

const line = (name: string, date: string, desc = 'a file') => `${name.padEnd(12)} N  123456  ${date}  ${desc}`;
const more = (text: string) => `${' '.repeat(33)}${text}`;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-list-'));
  for (const c of ['Conf1', 'Conf2']) fs.mkdirSync(path.join(root, c, 'Files'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), [
    line('OLD.LHA', '01-01-20'), more('second line of OLD'),
    line('KEEP.LHA', '02-02-24'), more('KEEP continues'),
  ].join('\r\n'));
  fs.writeFileSync(path.join(root, 'Conf2', 'DIR1'), line('NEWER.LHA', '06-06-25'));
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'OLD.LHA'), 'OLD BYTES');
  setStorageContext(null);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const ctx = () => ({ dataDir: root });
const read = (p: string) => fs.readFileSync(path.join(root, p), 'latin1');

test('finds an entry by name in any case, with its continuation lines', () => {
  const lines = read('Conf1/DIR1').split(/\r?\n/);
  expect(findEntryLines(lines, 'keep.lha')).toEqual({ start: 2, count: 2 });
  expect(findEntryLines(lines, 'MISSING.LHA')).toBeNull();
});

test('delete by name takes out that entry, all its lines, and its bytes', async () => {
  const outcome = await deleteEntry(ctx(), 1, 1, 'old.lha');
  expect(outcome.bytesError).toBeNull();
  expect(read('Conf1/DIR1')).not.toContain('OLD');
  expect(read('Conf1/DIR1')).toContain('KEEP continues');
  expect(fs.existsSync(path.join(root, 'Conf1', 'Files', 'OLD.LHA'))).toBe(false);
});

test('move by name: bytes to the destination, entry spliced in by date', async () => {
  await moveEntry(ctx(), { conf: 1, dir: 1, filename: 'OLD.LHA' }, { conf: 2, dir: 1 });
  expect(fs.existsSync(path.join(root, 'Conf2', 'Upload', 'OLD.LHA'))).toBe(true);
  expect(read('Conf1/DIR1')).not.toContain('OLD.LHA');
  const names = (await listEntries(ctx(), 2, 1)).map((e) => e.filename.trim());
  expect(names).toEqual(['OLD.LHA', 'NEWER.LHA']);
});

test('a file whose bytes are not there moves nothing', async () => {
  await expect(moveEntry(ctx(), { conf: 1, dir: 1, filename: 'KEEP.LHA' }, { conf: 2, dir: 1 })).rejects.toThrow();
  expect(read('Conf1/DIR1')).toContain('KEEP.LHA');
  expect(read('Conf2/DIR1')).not.toContain('KEEP.LHA');
});

// "there are no linebreaks in the file_id's" (sysop, 2026-09-29): a FILE_ID
// is a picture drawn in text, so its lines come back as stored.
test('a description comes back line by line, spacing and colour codes intact', () => {
  const header = `LXT-EE4D.ZIP N  59257  08-25-26     |\\_  _/\\__ _/\\`;
  const art = `${' '.repeat(33)}|  --   l a x i t y   p r e s e n t s   -- |`;
  const colour = `${' '.repeat(33)}\x1b[35mcoloured\x1b[0m   tail`;
  expect(descriptionLinesOf({ rawLines: [header, art, colour] })).toEqual([
    '   |\\_  _/\\__ _/\\',
    '|  --   l a x i t y   p r e s e n t s   -- |',
    '\x1b[35mcoloured\x1b[0m   tail',
  ]);
});

test('a delete removes every copy of the file, in any case, and says when there was none', async () => {
  // Live 2026-09-29: uploads sat in both Upload and Files; the delete took
  // the first copy and left the other on disk, unlisted.
  fs.mkdirSync(path.join(root, 'Conf1', 'Upload'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1', 'Upload', 'old.lha'), 'SECOND COPY');
  const outcome = await deleteEntry(ctx(), 1, 1, 'OLD.LHA');
  expect(outcome.bytesError).toBeNull();
  expect(fs.readdirSync(path.join(root, 'Conf1', 'Files'))).toEqual([]);
  expect(fs.readdirSync(path.join(root, 'Conf1', 'Upload'))).toEqual([]);

  const missing = await deleteEntry(ctx(), 1, 1, 'KEEP.LHA');
  expect(missing.bytesError).toMatch(/not found/);
  expect(read('Conf1/DIR1')).not.toContain('KEEP.LHA');
});
