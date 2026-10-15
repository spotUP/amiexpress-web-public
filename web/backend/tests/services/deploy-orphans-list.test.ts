/**
 * The ORPHANS list is the only way a deleted file leaves a live board.
 *
 * `docker-entrypoint.sh` syncs the image into the volume with `cp -r src/.
 * dst/`, which only ever ADDS. Deleting a file in git therefore does nothing
 * to a board that already has it: the thirteen `logon20.txt_.txt` backups and
 * the 42 MB `68klog.txt` trace would have sat on the volume for ever, and a
 * deploy of an older image could even put them back.
 *
 * The list cuts both ways, so both directions are pinned here:
 *
 *  - a path in ORPHANS must NOT be shipped by the image, or every deploy
 *    copies the file in and then deletes it again;
 *  - the files this board deleted must BE in ORPHANS, or they never leave.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'docker-entrypoint.sh');

/** The quoted entries of the ORPHANS=( ... ) array, as volume-relative paths. */
function orphanPaths(): string[] {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('ORPHANS=(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n    )', start);
  expect(end).toBeGreaterThan(start);

  return source
    .slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"$BBS_DATA_DIR/'))
    .map((line) => line.replace('"$BBS_DATA_DIR/', '').replace(/"$/, ''));
}

describe('the deploy ORPHANS list', () => {
  it('names only files the image does NOT ship', () => {
    // What the image carries is what git carries - the Docker build copies a
    // clean checkout, so an ignored file on a developer's disk (68klog.txt is
    // still here, untracked) is not shipped and is not a violation.
    const tracked = execFileSync('git', ['ls-files', '-z', '--', ...orphanPaths()], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    expect(tracked).toEqual([]);
  });

  it('names every logon20.txt_ backup that was deleted from git', () => {
    const listed = orphanPaths();
    const expected = [
      'logon20.txt_.txt',
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => `Node${n}/logon20.txt_.txt`),
    ];
    for (const rel of expected) {
      expect(listed).toContain(rel);
    }
  });

  it('names the 68K trace the screen gallery read as art', () => {
    expect(orphanPaths()).toContain('68klog.txt');
  });
});
