/**
 * Closing the gaps in conference directories, on a board shaped like the live one.
 *
 * `1->Conf2, 2->Conf3, 3->Conf5, 4->Conf8, 5->Conf12`, with the empty `Conf1`
 * and `Conf4` the entrypoint seeds sitting in the way. The chain collides with
 * itself - Conf2 is wanted by conference 2 while conference 1 holds it - so
 * every rename stages through a temporary name.
 *
 * It is not cosmetic: the deploy syncs the IMAGE's `Conf<n>/Screens` into the
 * volume's directory of the same name, so with the mapping skewed the repo's
 * conference 2 screens were landing in the board's conference 1.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compactConferenceDirectories, rewriteConferencePath } from '../../src/conferences/conference-directory-compaction';
import { planDirectoryCompaction } from '../../src/conferences/conference-directory-plan';

let root: string;

const info = (rel: string, lines: string[]) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, lines.join('\n') + '\n', 'latin1');
};
const file = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const tooltypes = (rel: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of fs.readFileSync(path.join(root, rel), 'latin1').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0) out.set(line.slice(0, eq).replace(/^[^A-Za-z]+/, '').toUpperCase(), line.slice(eq + 1));
  }
  return out;
};

/** The live board: five conferences, directories left behind, empty seeds in the way. */
function liveShapedBoard() {
  info('ConfConfig.info', [
    'NCONFS=5',
    'NAME.1=Amiga Demoscene', 'LOCATION.1=BBS:Conf2/',
    'NAME.2=C64 Demoscene', 'LOCATION.2=BBS:Conf3/',
    'NAME.3=Console Demoscene', 'LOCATION.3=BBS:Conf5/',
    'NAME.4=Requests', 'LOCATION.4=BBS:Conf8/',
    'NAME.5=Up Rough Internal', 'LOCATION.5=BBS:Conf12/',
  ]);
  // Each conference's own icon, named by NUMBER, with paths into its DIRECTORY.
  info('Conf1.info', ['NDIRS=2', 'DLPATH.1=BBS:Conf2/Files', 'ULPATH.1=BBS:Conf2/Upload']);
  info('Conf2.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf3/Files', 'ULPATH.1=BBS:Conf3/Upload']);
  info('Conf3.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf5/Files', 'ULPATH.1=BBS:Conf5/Upload']);
  info('Conf4.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf8/Files', 'ULPATH.1=BBS:Conf8/Upload']);
  info('Conf5.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf12/Upload/', 'ULPATH.1=BBS:Conf12/Upload/']);
  for (const [dir, marker] of [['Conf2', 'one'], ['Conf3', 'two'], ['Conf5', 'three'], ['Conf8', 'four'], ['Conf12', 'five']]) {
    file(`${dir}/marker.txt`, marker);
    file(`${dir}/MsgBase/1.dat`, marker);
  }
  // The entrypoint seeds every Conf1..Conf14 whether a board uses them or not.
  for (const d of ['Conf1', 'Conf4']) for (const sub of ['MsgBase', 'Screens']) fs.mkdirSync(path.join(root, d, sub), { recursive: true });
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('the path rewriter renames only whole conference directories', () => {
  const moves = new Map([['conf12', 'Conf5'], ['conf2', 'Conf1']]);

  expect(rewriteConferencePath('BBS:Conf12/Upload/', moves)).toBe('BBS:Conf5/Upload/');
  expect(rewriteConferencePath('BBS:Conf2/Files', moves)).toBe('BBS:Conf1/Files');
  // Conf120 is not Conf12, and a name that only CONTAINS one is left alone.
  expect(rewriteConferencePath('BBS:Conf120/Files', moves)).toBe('BBS:Conf120/Files');
  expect(rewriteConferencePath('BBS:Doors/Conf12Tool/', moves)).toBe('BBS:Doors/Conf12Tool/');
});

test('a dry run reports the moves and changes nothing', () => {
  liveShapedBoard();

  const res = compactConferenceDirectories(root, { dryRun: true });

  expect(res.moved.map(m => `${m.from}->${m.to}`))
    .toEqual(['Conf2->Conf1', 'Conf3->Conf2', 'Conf5->Conf3', 'Conf8->Conf4', 'Conf12->Conf5']);
  expect(res.absorbed.sort()).toEqual(['Conf1', 'Conf4']);
  expect(res.backupDir).toBeNull();
  // Untouched.
  expect(fs.readFileSync(path.join(root, 'Conf12', 'marker.txt'), 'latin1')).toBe('five');
  expect(tooltypes('ConfConfig.info').get('LOCATION.5')).toBe('BBS:Conf12/');
});

test('every conference ends up in the directory its number names, with its own files', () => {
  liveShapedBoard();

  const res = compactConferenceDirectories(root);

  expect(res.refused).toBeUndefined();
  expect(res.moved).toHaveLength(5);
  // The content travelled with the conference, not with the name.
  expect(fs.readFileSync(path.join(root, 'Conf1', 'marker.txt'), 'latin1')).toBe('one');
  expect(fs.readFileSync(path.join(root, 'Conf5', 'marker.txt'), 'latin1')).toBe('five');
  expect(fs.readFileSync(path.join(root, 'Conf3', 'MsgBase', '1.dat'), 'latin1')).toBe('three');
  // Nothing is left behind under an old name.
  expect(fs.existsSync(path.join(root, 'Conf8'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'Conf12'))).toBe(false);
});

test('the mapping and the file-area paths follow the directories', () => {
  liveShapedBoard();

  compactConferenceDirectories(root);

  const map = tooltypes('ConfConfig.info');
  expect(map.get('LOCATION.1')).toBe('BBS:Conf1/');
  expect(map.get('LOCATION.5')).toBe('BBS:Conf5/');
  // Conference 5's icon pointed into Conf12; it points into Conf5 now.
  expect(tooltypes('Conf5.info').get('DLPATH.1')).toBe('BBS:Conf5/Upload/');
  expect(tooltypes('Conf1.info').get('DLPATH.1')).toBe('BBS:Conf1/Files');
  expect(tooltypes('Conf3.info').get('ULPATH.1')).toBe('BBS:Conf3/Upload');
});

test('the board reads as compacted afterwards - the plan has nothing left to do', () => {
  liveShapedBoard();

  compactConferenceDirectories(root);

  expect(planDirectoryCompaction(root).moves).toEqual([]);
});

test('the empty seeds in the way are kept in the backup, not deleted', () => {
  liveShapedBoard();

  const res = compactConferenceDirectories(root);

  expect(res.backupDir).toBeTruthy();
  expect(fs.existsSync(path.join(res.backupDir!, 'absorbed-Conf1'))).toBe(true);
  expect(fs.existsSync(path.join(res.backupDir!, 'absorbed-Conf4'))).toBe(true);
  // And every icon it was about to rewrite.
  expect(fs.existsSync(path.join(res.backupDir!, 'ConfConfig.info'))).toBe(true);
  expect(fs.existsSync(path.join(res.backupDir!, 'Conf5.info'))).toBe(true);
});

test('a directory in the way with FILES in it stops the whole run', () => {
  liveShapedBoard();
  file('Conf1/somebodys-data.txt', 'not mine to move');

  const res = compactConferenceDirectories(root);

  expect(res.refused).toMatch(/not empty/);
  expect(res.moved).toEqual([]);
  // Every conference is exactly where it was.
  expect(fs.readFileSync(path.join(root, 'Conf12', 'marker.txt'), 'latin1')).toBe('five');
  expect(fs.readFileSync(path.join(root, 'Conf1', 'somebodys-data.txt'), 'latin1')).toBe('not mine to move');
});

test('a board already in order is left alone', () => {
  info('ConfConfig.info', ['NCONFS=2', 'NAME.1=One', 'LOCATION.1=BBS:Conf1/', 'NAME.2=Two', 'LOCATION.2=BBS:Conf2/']);
  for (const d of ['Conf1', 'Conf2']) file(`${d}/marker.txt`, d);

  const res = compactConferenceDirectories(root);

  expect(res.moved).toEqual([]);
  expect(res.backupDir).toBeNull();
  expect(fs.readFileSync(path.join(root, 'Conf2', 'marker.txt'), 'latin1')).toBe('Conf2');
});
