/**
 * A screen edited in the repo has to reach a board that already exists.
 *
 * Screens were seeded to the persistent volume on FIRST RUN ONLY, so every
 * change made to `Screens/*.txt` after a board's first boot never arrived:
 * the volume kept whatever it was initialised with, deploy after deploy.
 *
 * Reported 2026-09-07: random wipe animations (`~WX` and friends) were added
 * to the screen files, worked on localhost, and were invisible on the live
 * board - live's volume still held the pre-wipe screens. The only remedy was
 * FORCE_REINIT_SCREENS=1, which `rm -rf`s the directory and takes every
 * screen the sysop wrote with it.
 *
 * Screens now go through sync_tracked, the same three-way reconciliation the
 * Commands tree uses: the image leads until the sysop takes a file over.
 * Screens ARE sysop-edited - the admin has a screen editor with revision
 * history - so "always overwrite" would be the wrong fix and this is the
 * right one.
 *
 * Driven through the real shell out of the real entrypoint: a TypeScript
 * re-implementation would prove nothing about the script that runs on deploy.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('sync_image_owned() {');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('sync_tracked and its helpers were not found in docker-entrypoint.sh');
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
    for rel in $(cd "$DEFAULT_DATA_DIR" && find Screens -type f | sed 's|^\\./||'); do
      sync_tracked_case_aware "$rel"
    done
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    echo "created=$TRACKED_CREATED updated=$TRACKED_UPDATED kept=$TRACKED_KEPT adopted=$TRACKED_ADOPTED"
  `;
  return execFileSync('sh', ['-c', script], { encoding: 'utf8' }).trim();
}

let root: string;
const imageScreens = () => path.join(root, 'image', 'Screens');
const volumeScreens = () => path.join(root, 'volume', 'Screens');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-sync-'));
  fs.mkdirSync(imageScreens(), { recursive: true });
  fs.mkdirSync(volumeScreens(), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (dir: string, name: string, body: string) =>
  fs.writeFileSync(path.join(dir, name), body);
const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

test('a wipe added to a screen in the repo reaches a board that already exists', () => {
  // The board was seeded with the pre-wipe screen on some earlier deploy.
  write(imageScreens(), 'MENU.TXT', 'Main Menu\n');
  write(volumeScreens(), 'MENU.TXT', 'Main Menu\n');
  deploy(root);

  // Now the repo adds the wipe. THIS is what never used to arrive.
  write(imageScreens(), 'MENU.TXT', '~WXMain Menu\n');
  deploy(root);

  expect(read(volumeScreens(), 'MENU.TXT')).toBe('~WXMain Menu\n');
});

test('a screen the sysop edited on the board is NOT overwritten', () => {
  write(imageScreens(), 'BULLETIN.TXT', 'shipped\n');
  write(volumeScreens(), 'BULLETIN.TXT', 'shipped\n');
  deploy(root);

  // The sysop rewrites it through the admin's screen editor.
  write(volumeScreens(), 'BULLETIN.TXT', 'the sysop wrote this\n');
  // And the image moves on underneath them.
  write(imageScreens(), 'BULLETIN.TXT', 'a later version from the repo\n');
  deploy(root);

  expect(read(volumeScreens(), 'BULLETIN.TXT')).toBe('the sysop wrote this\n');
});

test('a screen the sysop deleted stays deleted across deploys', () => {
  write(imageScreens(), 'GOODBYE.TXT', 'bye\n');
  deploy(root);
  expect(fs.existsSync(path.join(volumeScreens(), 'GOODBYE.TXT'))).toBe(true);

  fs.rmSync(path.join(volumeScreens(), 'GOODBYE.TXT'));
  deploy(root);

  expect(fs.existsSync(path.join(volumeScreens(), 'GOODBYE.TXT'))).toBe(false);
});

test('a screen this board has never had arrives', () => {
  write(imageScreens(), 'NEWSCREEN.TXT', 'hello\n');

  deploy(root);

  expect(read(volumeScreens(), 'NEWSCREEN.TXT')).toBe('hello\n');
});
