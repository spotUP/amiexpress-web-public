/**
 * A conference has the file areas its ICON declares, not the ones left on disk.
 *
 * `parseFileAreas` used to import every `Dir<n>.info` it could see. On the
 * reference-boardBBS reference tree in this repo, Conf1 declares `NDIRS=1` and
 * carries Dir0, Dir1 and Dir2 - so an import created three file areas where
 * the board has one, and one of the three was `Dir0`, which is not a numbered
 * area at all.
 *
 * express.e is the authority: `maxDirs := readToolTypeInt(TOOLTYPE_CONF, conf,
 * 'NDIRS')` (5006, 15264), and every directory operation is refused outside
 * `1 <= which <= maxDirs` (10031-10042) - which is also where the 1-based
 * numbering comes from.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';

let root: string;

/** A conference directory with more Dir icons on disk than the icon declares. */
function board(ndirs: string | null, dirs: number[]): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-areas-'));
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });

  // A plain-text .info is a real one this codebase writes and reads; the
  // format owner handles both it and a binary icon.
  if (ndirs !== null) fs.writeFileSync(path.join(root, 'Conf1.info'), `NDIRS=${ndirs}\n`);
  for (const n of dirs) fs.writeFileSync(path.join(root, 'Conf1', `Dir${n}.info`), 'NAME=Area\n');

  return root;
}

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('imports only as many areas as the conference declares', async () => {
  const bbs = board('1', [0, 1, 2]);

  const areas = await new AmigaParserService().parseFileAreas(
    path.join(bbs, 'Conf1'),
    1,
  );

  expect(areas.map(a => a.number)).toEqual([1]);
});

test('never imports Dir0, because express.e numbers directories from 1', async () => {
  const bbs = board('3', [0, 1, 2, 3]);

  const areas = await new AmigaParserService().parseFileAreas(path.join(bbs, 'Conf1'), 3);

  expect(areas.map(a => a.number)).toEqual([1, 2, 3]);
});

test('a conference with no NDIRS has no file areas', async () => {
  // readToolTypeInt answers -1 for a missing key (tooltypes.e:176-181), and
  // `which <= -1` never holds, so the board offers no directory.
  const bbs = board(null, [0, 1, 2]);

  const areas = await new AmigaParserService().parseFileAreas(path.join(bbs, 'Conf1'), 0);

  expect(areas).toEqual([]);
});

test('reads the whole board the same way, through parseConferences', async () => {
  const bbs = board('1', [0, 1, 2]);
  fs.writeFileSync(path.join(bbs, 'ConfConfig.info'), 'NCONFS=1\nNAME.1=Lamer Zone\n');

  const confs = await new AmigaParserService().parseConferences(bbs);

  expect(confs[0].fileAreas.map(a => a.number)).toEqual([1]);
});
