/**
 * What a directory compaction would move, before anything moves.
 *
 * Removing a conference renumbers everything keyed by position but leaves the
 * DIRECTORY where it was: LOCATION.n carries its old value down, so the live
 * board reads `1->Conf2, 2->Conf3, 3->Conf5, 4->Conf8, 5->Conf12`. The sysop
 * asked for the directories to close up too. A directory is named in more
 * places than the mapping, so this reports and does not touch.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planDirectoryCompaction, describeCompactionPlan } from '../../src/conferences/conference-directory-plan';

let root: string;

/** A text .info, which the parser reads as tooltypes. */
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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'confplan-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** The live board's shape: five conferences, directories left behind. */
function sparseBoard() {
  info('ConfConfig.info', [
    'NCONFS=5',
    'NAME.1=Amiga Demoscene', 'LOCATION.1=BBS:Conf2/',
    'NAME.2=C64 Demoscene', 'LOCATION.2=BBS:Conf3/',
    'NAME.3=Console Demoscene', 'LOCATION.3=BBS:Conf5/',
    'NAME.4=Requests', 'LOCATION.4=BBS:Conf8/',
    'NAME.5=Up Rough Internal', 'LOCATION.5=BBS:Conf12/',
  ]);
  for (const d of ['Conf2', 'Conf3', 'Conf5', 'Conf8', 'Conf12']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    file(`${d}/bull20.txt`, 'a bulletin\r\n');
  }
}

test('a board whose directories already match its numbers has nothing to do', () => {
  info('ConfConfig.info', ['NCONFS=2', 'NAME.1=One', 'LOCATION.1=BBS:Conf1/', 'NAME.2=Two', 'LOCATION.2=BBS:Conf2/']);
  for (const d of ['Conf1', 'Conf2']) fs.mkdirSync(path.join(root, d), { recursive: true });

  const plan = planDirectoryCompaction(root);

  expect(plan.moves).toEqual([]);
  expect(describeCompactionPlan(plan)).toContain('Nothing to do');
});

test('the live board proposes the four moves that close the gaps', () => {
  sparseBoard();

  const plan = planDirectoryCompaction(root);

  expect(plan.current.map(c => `${c.conference}:${c.dir}`))
    .toEqual(['1:Conf2', '2:Conf3', '3:Conf5', '4:Conf8', '5:Conf12']);
  expect(plan.moves.map(m => `${m.from}->${m.to}`))
    .toEqual(['Conf2->Conf1', 'Conf3->Conf2', 'Conf5->Conf3', 'Conf8->Conf4', 'Conf12->Conf5']);
  // The weight of each move is reported, so a sysop knows what is being carried.
  expect(plan.moves.every(m => m.files > 0)).toBe(true);
});

test('a name another conference still holds is a blocker, not a silent overwrite', () => {
  sparseBoard();

  const plan = planDirectoryCompaction(root);

  // Conf2 is wanted by conference 2 and held by conference 1: the move has to
  // stage through a temporary name.
  expect(plan.blockers.some(b => b.includes('Conf2') && b.includes('temporary name'))).toBe(true);
});

test('a pooled file area is called out: its object prefix is built from the path that would move', () => {
  sparseBoard();
  info('Drives.info', ['DRIVE.3=s3://retroranks-logos', 'ENDPOINT.3=https://example.r2.cloudflarestorage.com']);
  info('Conf5.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf12/Files/', 'STORAGEDRIVE.1=3']);

  const plan = planDirectoryCompaction(root);

  expect(plan.references.some(r => r.key === 'DLPATH.1' && r.value.includes('Conf12'))).toBe(true);
  expect(plan.blockers.some(b => b.includes('OBJECT KEY PREFIX'))).toBe(true);
});

test('a screen that names a moving directory is listed, and marked as a hand edit', () => {
  sparseBoard();
  file('Screens/BULL.TXT', '~SS_BBS:Conf12/Bulletins/welcome.txt\r\n');

  const plan = planDirectoryCompaction(root);

  const hit = plan.references.find(r => r.file.toLowerCase() === path.join('screens', 'bull.txt').toLowerCase());
  expect(hit).toBeDefined();
  expect(hit!.value).toContain('Conf12/');
  expect(hit!.manual).toBe(true);
});

test('the mapping itself is the one thing a mover would rewrite for you', () => {
  sparseBoard();

  const plan = planDirectoryCompaction(root);

  const mapping = plan.references.filter(r => r.file.toLowerCase() === 'confconfig.info');
  expect(mapping.length).toBeGreaterThan(0);
  expect(mapping.every(r => r.manual === false)).toBe(true);
});

test('a Conf directory no conference points at is a blocker', () => {
  sparseBoard();
  fs.mkdirSync(path.join(root, 'Conf9'), { recursive: true });

  const plan = planDirectoryCompaction(root);

  expect(plan.blockers.some(b => b.includes('Conf9') && b.includes('no conference points at them'))).toBe(true);
});

test('nothing on disk changes', () => {
  sparseBoard();
  const before = fs.readdirSync(root).sort();

  planDirectoryCompaction(root);

  expect(fs.readdirSync(root).sort()).toEqual(before);
  expect(fs.existsSync(path.join(root, 'Conf12', 'bull20.txt'))).toBe(true);
});
