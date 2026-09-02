/**
 * Command icons reach the board under the volume's own spelling of the name.
 *
 * The Amiga's filesystem is case-insensitive and Linux's is not. This board's
 * volume holds `N.info` and `GL.info` where the image ships `n.info` and
 * `gl.info`; syncing by the image's name writes a SECOND file beside the one
 * already there, and the board then has two icons for one command with
 * `findCaseInsensitive` picking whichever it meets first. It has happened
 * already: the live manifest carries both `Commands/BBSCmd/N.info` and
 * `Commands/BBSCmd/n.info`.
 *
 * The rest of the rules are sync_tracked's and are tested by its sibling
 * deploy-manifest-sync.test.ts; they are exercised here through the wrapper
 * so that using it cannot quietly lose them. In particular a command icon is
 * exactly the file a sysop deletes - DOORMAN removing a door removes its icon
 * - and a deploy that copied it back brought the door back with it.
 *
 * Driven through the real shell out of the real entrypoint: a TypeScript
 * re-implementation would prove nothing about the script that actually runs.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The manifest helpers, sync_tracked and sync_command_icons, lifted verbatim. */
function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('sync_image_owned() {');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('sync_tracked_case_aware and its helpers were not found in docker-entrypoint.sh');
  }
  return source.slice(start, end);
}

/** One deploy over a temp image/volume pair, running the real function. */
function deploy(root: string): string {
  const script = `
    set -eu
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${extractFunctions()}
    TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
    rm -f "$DEPLOY_MANIFEST_NEXT"
    for rel in $(cd "$DEFAULT_DATA_DIR" && find Commands -type f | sed 's|^\./||'); do
      sync_tracked_case_aware "$rel"
    done
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    echo "created=$TRACKED_CREATED updated=$TRACKED_UPDATED kept=$TRACKED_KEPT adopted=$TRACKED_ADOPTED"
  `;
  return execFileSync('sh', ['-c', script], { encoding: 'utf8' }).trim();
}

let root: string;
const imageCmd = () => path.join(root, 'image', 'Commands', 'BBSCmd');
const volumeCmd = () => path.join(root, 'volume', 'Commands', 'BBSCmd');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-icons-'));
  fs.mkdirSync(imageCmd(), { recursive: true });
  fs.mkdirSync(volumeCmd(), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (dir: string, name: string, body: string) =>
  fs.writeFileSync(path.join(dir, name), body);
const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const listVolume = () => fs.readdirSync(volumeCmd()).sort();

test('an icon the image ships and this board has never had arrives', () => {
  write(imageCmd(), 'conftop.info', 'NAME=Conference Top\n');

  deploy(root);

  expect(read(volumeCmd(), 'conftop.info')).toBe('NAME=Conference Top\n');
});

test('an icon the sysop deleted stays deleted, so a door DOORMAN removed does not come back', () => {
  write(imageCmd(), 'vsys.info', 'NAME=Vsys\n');
  deploy(root);
  fs.rmSync(path.join(volumeCmd(), 'vsys.info'));

  deploy(root);

  expect(fs.existsSync(path.join(volumeCmd(), 'vsys.info'))).toBe(false);
});

test('an icon the sysop edited on the board is kept, not reverted to the image', () => {
  write(imageCmd(), 'gwall.info', 'NAME=Global Wall\nACCESS=10\n');
  deploy(root);
  write(volumeCmd(), 'gwall.info', 'NAME=Global Wall\nACCESS=200\n');

  deploy(root);

  expect(read(volumeCmd(), 'gwall.info')).toContain('ACCESS=200');
});

test('an icon changed in the image reaches a board that never touched it', () => {
  write(imageCmd(), 'doorman.info', 'NAME=Doorman\nACCESS=10\n');
  deploy(root);
  write(imageCmd(), 'doorman.info', 'NAME=Door Manager\nACCESS=10\n');

  deploy(root);

  expect(read(volumeCmd(), 'doorman.info')).toContain('NAME=Door Manager');
});

test('a name differing only in case updates the volume\'s copy instead of adding a second', () => {
  // The Amiga's filesystem is case-insensitive and Linux's is not. This board
  // really does hold N.info and GL.info where the image ships n.info and
  // gl.info; writing both would give it two icons for one command.
  //
  // Asserted on the DECISION, not on the directory listing: a developer's
  // macOS temp filesystem is itself case-insensitive, so `ls` cannot tell the
  // two apart and the first version of this test passed with the case branch
  // deleted. The log line is the same on both.
  write(volumeCmd(), 'N.info', 'NAME=New files\n');
  write(imageCmd(), 'n.info', 'NAME=New files\n');

  const first = deploy(root);
  expect(first).toContain('volume has N.info where the image ships n.info');

  write(imageCmd(), 'n.info', 'NAME=New Files Scan\n');
  const second = deploy(root);

  expect(second).toContain('volume has N.info where the image ships n.info');
  expect(listVolume()).toEqual(['N.info']);
  expect(read(volumeCmd(), 'N.info')).toContain('NAME=New Files Scan');
});

test('a name the volume does not hold at all is written under the image\'s own name', () => {
  write(imageCmd(), 'conftop.info', 'NAME=Conference Top\n');

  expect(deploy(root)).not.toContain('where the image ships');
  expect(listVolume()).toEqual(['conftop.info']);
});

test('everything under Commands is tracked, backups beside an icon included', () => {
  // The loop is `find Commands -type f`, not a `*.info` glob, and the live
  // volume carries those backups. Pinned because a narrower filter would look
  // like tidying and would in fact stop tracking them: a file that leaves the
  // tracked set stops being protected from a later blanket copy.
  write(imageCmd(), 'cs.info', 'NAME=Comment\n');
  write(imageCmd(), 'cs.info.backup', 'NAME=Old comment\n');

  deploy(root);

  expect(listVolume()).toEqual(['cs.info', 'cs.info.backup']);
});

test('a file in a Commands subdirectory the volume lacks is created there', () => {
  // Commands/SysCmd and the per-conference Conf<N>Cmd directories go through
  // the same loop.
  fs.mkdirSync(path.join(root, 'image', 'Commands', 'SysCmd'), { recursive: true });
  write(path.join(root, 'image', 'Commands', 'SysCmd'), 'n.info', 'NAME=Node\n');

  deploy(root);

  expect(fs.readFileSync(path.join(root, 'volume', 'Commands', 'SysCmd', 'n.info'), 'utf8'))
    .toBe('NAME=Node\n');
});
