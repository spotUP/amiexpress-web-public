/**
 * A conference has the file directories its icon declares: NDIRS, the one
 * number express.e reads (5006, 15264 maxDirs:=readToolTypeInt(...,'NDIRS')).
 *
 * The port counted DIR files on disk for F, FR, FM, Z, V and A, read a plain
 * NDIRS FILE for the screen index, and the tooltype elsewhere - so a leftover
 * DIR file became a directory the board offered and express.e does not
 * (research 2026-09-29, admin file manager).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { conferenceNdirs } from '../../src/conferences/conference-paths';
import { getMaxDirs } from '../../src/utils/max-dirs.util';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ndirs-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=2\nNAME.1=Main\nLOCATION.1=BBS:Conf1/\nNAME.2=Bare\nLOCATION.2=BBS:Conf2/\n');
  for (const conf of ['Conf1', 'Conf2']) fs.mkdirSync(path.join(root, conf), { recursive: true });
  // Three DIR files on disk, but the icon declares one.
  for (const n of [1, 2, 3]) fs.writeFileSync(path.join(root, 'Conf1', `DIR${n}`), '\n');
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
  // A plain NDIRS FILE saying 5 is not what the board reads either.
  fs.writeFileSync(path.join(root, 'Conf1', 'NDIRS'), '5');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('the icon NDIRS decides, not the DIR files on disk or an NDIRS file', async () => {
  expect(conferenceNdirs(root, 1)).toBe(1);
  expect(await getMaxDirs(1, root)).toBe(1);
});

test('no NDIRS on the icon - no file areas', async () => {
  fs.writeFileSync(path.join(root, 'Conf2', 'DIR1'), '\n');
  expect(conferenceNdirs(root, 2)).toBe(0);
  expect(await getMaxDirs(2, root)).toBe(0);
});
