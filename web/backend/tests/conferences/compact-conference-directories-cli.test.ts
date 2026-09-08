/**
 * The script that finally CALLS the conference compactor.
 *
 * `conference-directory-plan.ts` and `conference-directory-compaction.ts` were
 * written, tested and imported by nothing, so the live board still carries the
 * skew they fix (`1->Conf2, 2->Conf3, 3->Conf5, 4->Conf8, 5->Conf12`). These
 * tests drive `runConferenceCompaction` - the script's own entry point, the
 * one `require.main === module` runs - and not the modules underneath it,
 * because the defect being fixed is that nothing reached them.
 *
 * The load-bearing case is the second one. The plan reports the self-collision
 * (`Conf2` is wanted by conference 2 while conference 1 holds it) as a
 * blocker, and a mover that refused on the whole blocker list would refuse
 * every board that needs compacting at all - a live mapping collides with
 * itself by definition. `stoppingBlockers()` is what keeps that one advisory.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runConferenceCompaction } from '../../src/scripts/compact-conference-directories';

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
  info('Conf1.info', ['NDIRS=2', 'DLPATH.1=BBS:Conf2/Files', 'ULPATH.1=BBS:Conf2/Upload']);
  info('Conf2.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf3/Files', 'ULPATH.1=BBS:Conf3/Upload']);
  info('Conf3.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf5/Files', 'ULPATH.1=BBS:Conf5/Upload']);
  info('Conf4.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf8/Files', 'ULPATH.1=BBS:Conf8/Upload']);
  info('Conf5.info', ['NDIRS=1', 'DLPATH.1=BBS:Conf12/Upload/', 'ULPATH.1=BBS:Conf12/Upload/']);
  for (const [dir, marker] of [['Conf2', 'one'], ['Conf3', 'two'], ['Conf5', 'three'], ['Conf8', 'four'], ['Conf12', 'five']]) {
    file(`${dir}/marker.txt`, marker);
  }
  for (const d of ['Conf1', 'Conf4']) fs.mkdirSync(path.join(root, d, 'MsgBase'), { recursive: true });
}

const run = (argv: string[]): { code: number; text: string } => {
  const lines: string[] = [];
  const code = runConferenceCompaction(argv, (line) => lines.push(line), root);
  return { code, text: lines.join('\n') };
};

const marker = (dir: string): string | null => {
  try { return fs.readFileSync(path.join(root, dir, 'marker.txt'), 'latin1'); } catch { return null; }
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-cli-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('reports without --apply, and renames nothing', () => {
  liveShapedBoard();

  const { code, text } = run([]);

  expect(code).toBe(0);
  expect(text).toContain('conference 1: Conf2 -> Conf1');
  expect(text).toContain('conference 5: Conf12 -> Conf5');
  expect(text).toContain('Re-run with --apply');
  // The board is exactly as it was.
  expect(marker('Conf2')).toBe('one');
  expect(marker('Conf12')).toBe('five');
  expect(fs.existsSync(path.join(root, '_conf-backups'))).toBe(false);
});

test('--apply compacts the live-shaped board - the self-collision is not a refusal', () => {
  liveShapedBoard();

  const { code, text } = run(['--apply']);

  expect(code).toBe(0);
  expect(text).not.toContain('REFUSED');
  // Every conference now lives in the directory its number names, carrying
  // its own contents with it.
  expect(marker('Conf1')).toBe('one');
  expect(marker('Conf2')).toBe('two');
  expect(marker('Conf3')).toBe('three');
  expect(marker('Conf4')).toBe('four');
  expect(marker('Conf5')).toBe('five');
  expect(fs.existsSync(path.join(root, 'Conf8'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'Conf12'))).toBe(false);
  // And the mapping was rewritten to match.
  const confConfig = fs.readFileSync(path.join(root, 'ConfConfig.info'), 'latin1');
  expect(confConfig).toContain('LOCATION.1=BBS:Conf1/');
  expect(confConfig).toContain('LOCATION.5=BBS:Conf5/');
});

test('a pooled file area refuses the run, and --force is what overrides it', () => {
  liveShapedBoard();
  // A pooled area's object-key prefix is built from the download path, so a
  // rename strands every object already in the bucket - the one blocker no
  // local backup can undo.
  file('Drives.info', 'POOLED=1\n');

  const refused = run(['--apply']);
  expect(refused.code).toBe(1);
  expect(refused.text).toContain('OBJECT KEY PREFIX');
  expect(marker('Conf2')).toBe('one');

  const forced = run(['--apply', '--force']);
  expect(forced.code).toBe(0);
  expect(marker('Conf1')).toBe('one');
});

test('a board that is already sequential says so and does nothing', () => {
  info('ConfConfig.info', ['NCONFS=2', 'LOCATION.1=BBS:Conf1/', 'LOCATION.2=BBS:Conf2/']);
  file('Conf1/marker.txt', 'one');
  file('Conf2/marker.txt', 'two');

  const { code, text } = run(['--apply']);

  expect(code).toBe(0);
  expect(text).toContain('Nothing to do');
  expect(marker('Conf1')).toBe('one');
});
