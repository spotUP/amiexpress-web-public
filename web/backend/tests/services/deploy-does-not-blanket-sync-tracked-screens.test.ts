/**
 * THE BLANKET SYNC MUST NOT TOUCH A DIRECTORY THE TRACKED SYNC OWNS.
 *
 * `docker-entrypoint.sh` reconciles the image and the volume two different
 * ways, and for a year they overlapped:
 *
 *   * a blanket `tar` of the directories the image owns outright, which
 *     OVERWRITES whatever the volume holds; and
 *   * `sync_tracked`, which asks whether the sysop edited a file and keeps
 *     their version if so.
 *
 * `Screens` was in BOTH, and the tar ran 140 lines first. So every screen the
 * sysop edited was overwritten by the image's copy, and `sync_tracked` then
 * compared a volume that already matched the image and recorded it as
 * untouched. The tracked-screens machinery was dead on arrival and every test
 * of it passed, because the tests drive `sync_tracked` and never the tar that
 * ran before it. THAT is the hole this file closes: not "does sync_tracked
 * keep an edit" - deploy-syncs-screens.test.ts already proves that - but
 * "does anything undo it first".
 *
 * Found on the live board 2026-09-15. The sysop: "i have noticed that some
 * screens reverts on the live site i have replaced the petscii bbs title many
 * times and now an old default is back". `Screens/Node/BBSTITLE.SEQ` on the
 * volume was byte-identical to the image's copy with an mtime of 20:34:18 -
 * the deploy's extraction time, not an edit - and the sysop's own
 * `BBSTITLE.SEQ.backup` sat beside it, which is the very evidence
 * `sysop_edited_screen` reads and never got to.
 *
 * Driven through the real shell out of the real entrypoint: the two lists are
 * read from the script that runs on deploy, not restated here.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const ENTRYPOINT = path.join(REPO, 'docker-entrypoint.sh');
const BOARD_WRITTEN = path.join(REPO, 'web', 'backend', 'src', 'screens', 'board-written-screens.json');

function helpers(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('# --- end of the deploy sync helpers');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('the deploy sync helpers were not found in docker-entrypoint.sh');
  }
  return source.slice(start, end);
}

/** Run a fragment with the entrypoint's helpers in scope, over a staged image. */
function run(root: string, body: string): string {
  return execFileSync('sh', ['-c', `
    set -eu
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    BOARD_WRITTEN_LIST="${BOARD_WRITTEN}"
    ${helpers()}
    ${body}
  `], { encoding: 'utf8' }).trim();
}

let root: string;

const stage = (rel: string, body = 'art\n') => {
  const full = path.join(root, 'image', rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-overlap-'));
  fs.mkdirSync(path.join(root, 'image'), { recursive: true });
  fs.mkdirSync(path.join(root, 'volume'), { recursive: true });
  // A conference the board still has, so list_tracked_screens walks Conf1.
  fs.mkdirSync(path.join(root, 'volume', 'Conf1'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the blanket sync and the tracked sync do not overlap', () => {
  it('never blanket-syncs a directory whose screens the sysop can edit', () => {
    stage('Screens/Node/BBSTITLE.SEQ');
    stage('Screens/logon20.txt');
    stage('Conf1/Screens/MENU250.TXT');
    stage('Doors/REQUESTS/requests');
    stage('Libs/x.library');

    const tracked = run(root, 'list_tracked_screens').split('\n').filter(Boolean);
    const blanket = run(root, 'printf "%s\\n" $CODE_SYNC_DIRS').split('\n').filter(Boolean);

    expect(tracked).toContain('Screens/Node/BBSTITLE.SEQ');
    expect(blanket.length).toBeGreaterThan(0);

    // The tar extracts over the whole of each blanket directory, so a tracked
    // path UNDER one of them is overwritten before sync_tracked ever runs.
    const clobbered = tracked.filter(rel => blanket.includes(rel.split('/')[0]));
    expect(clobbered).toEqual([]);
  });

  it('leaves the screens the board writes for itself out of the tracked set', () => {
    // They cannot be tracked: sync_tracked reads a divergence with no
    // `.backup` and no `.Revisions` as "predates the tracked set" and takes
    // the image's copy - and a door's output leaves neither mark. That is the
    // 2026-09-15 quicknew overwrite, arriving by the other road.
    stage('Screens/quicknew.txt');
    stage('Screens/lastc.txt');
    stage('Screens/bull9.txt');
    stage('Screens/callerslog.txt');
    stage('Screens/68klog.log');
    stage('Conf1/Screens/quicknew.txt');
    stage('Screens/bull10.txt');
    stage('Screens/Node/BBSTITLE.SEQ');

    const tracked = run(root, 'list_tracked_screens').split('\n').filter(Boolean);

    for (const written of [
      'Screens/quicknew.txt', 'Screens/lastc.txt', 'Screens/bull9.txt',
      'Screens/callerslog.txt', 'Screens/68klog.log', 'Conf1/Screens/quicknew.txt',
    ]) {
      expect(tracked).not.toContain(written);
    }
    // Art with a similar name is still art, and an artist still owns it.
    expect(tracked).toContain('Screens/bull10.txt');
    expect(tracked).toContain('Screens/Node/BBSTITLE.SEQ');
  });

  it('keeps the sysop’s PETSCII title across a deploy that changes the image', () => {
    // The live symptom, end to end: the image ships a new BBSTITLE.SEQ, the
    // sysop has drawn their own, and the admin editor left the `.backup` it
    // always leaves. The sysop's bytes win.
    stage('Screens/Node/BBSTITLE.SEQ', 'the image default\n');
    const vol = path.join(root, 'volume', 'Screens', 'Node');
    fs.mkdirSync(vol, { recursive: true });
    fs.writeFileSync(path.join(vol, 'BBSTITLE.SEQ'), 'the sysop petscii\n');
    fs.writeFileSync(path.join(vol, 'BBSTITLE.SEQ.backup'), 'what it replaced\n');

    run(root, `
      TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
      rm -f "$DEPLOY_MANIFEST_NEXT"
      list_tracked_screens | while IFS= read -r rel; do
        [ -n "$rel" ] || continue
        sync_tracked_case_aware "$rel"
      done
      [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
      true
    `);

    expect(fs.readFileSync(path.join(vol, 'BBSTITLE.SEQ'), 'utf8')).toBe('the sysop petscii\n');
  });
});
