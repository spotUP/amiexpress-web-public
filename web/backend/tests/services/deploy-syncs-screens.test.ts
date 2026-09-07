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
  const end = source.indexOf('# --- end of the deploy sync helpers');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('the deploy sync helpers were not found in docker-entrypoint.sh');
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
    # The entrypoint's own list. Deciding here which files to sync is how the
    # conference-root menu stayed stale with every test in this file green.
    list_tracked_screens | while IFS= read -r rel; do
      [ -n "$rel" ] || continue
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

/** The key `screen-revisions.ts` derives from a board-relative path. */
const revKey = (name: string) =>
  `Screens/${name}`.toLowerCase().replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '_');

/** A snapshot in the revision store, the way the admin's editor leaves one. */
function writeRevision(name: string): void {
  const dir = path.join(root, 'volume', 'Screens', '.Revisions', revKey(name));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09-01T00-00-00.000Z.txt'), 'an older version\n');
}

/** What the admin's screen editor actually does: revision, `.backup`, write. */
function adminEdit(name: string, body: string): void {
  const full = path.join(volumeScreens(), name);
  writeRevision(name);
  if (fs.existsSync(full)) fs.copyFileSync(full, `${full}.backup`);
  fs.writeFileSync(full, body);
}

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

  // The sysop rewrites it through the admin's screen editor, which leaves the
  // `.backup` sibling and a revision beside every screen it writes.
  adminEdit('BULLETIN.TXT', 'the sysop wrote this\n');
  // And the image moves on underneath them.
  write(imageScreens(), 'BULLETIN.TXT', 'a later version from the repo\n');
  deploy(root);

  expect(read(volumeScreens(), 'BULLETIN.TXT')).toBe('the sysop wrote this\n');
});

/**
 * The live board, exactly: the screens joined the tracked set on a deploy where
 * the volume ALREADY differed from the image, because it still held whatever
 * the board was seeded with when it was created.
 *
 * Adoption records the IMAGE's hash without copying anything, so from the next
 * deploy on the divergence reads as a sysop edit and the screen is kept for
 * ever. The sysop's wipe animations were on origin/main, the deploy fix was
 * live, and the main menu still did not wipe.
 *
 * The board knows the difference. The admin's screen editor leaves a `.backup`
 * beside every screen it writes and a snapshot in `Screens/.Revisions`, so a
 * divergence with NO such evidence is not a sysop edit - it is the stale seed.
 */
test("a stale screen nobody edited takes the repo's version", () => {
  write(imageScreens(), 'MENU250.TXT', '~WXMain Menu\n');
  // What this board was seeded with, years of repo changes ago.
  write(volumeScreens(), 'MENU250.TXT', 'Main Menu\n');

  deploy(root); // the deploy that first tracks screens
  deploy(root); // and the one after it

  expect(read(volumeScreens(), 'MENU250.TXT')).toBe('~WXMain Menu\n');
});

test('an edited screen survives that same first tracking deploy', () => {
  write(imageScreens(), 'MENU250.TXT', '~WXMain Menu\n');
  adminEdit('MENU250.TXT', 'the sysop drew this one\n');

  deploy(root);
  deploy(root);

  expect(read(volumeScreens(), 'MENU250.TXT')).toBe('the sysop drew this one\n');
});

test('a revision on its own is enough evidence, with no .backup beside it', () => {
  write(imageScreens(), 'MENU250.TXT', '~WXMain Menu\n');
  write(volumeScreens(), 'MENU250.TXT', 'the sysop drew this one\n');
  // An older edit whose `.backup` has since been cleaned away.
  writeRevision('MENU250.TXT');

  deploy(root);
  deploy(root);

  expect(read(volumeScreens(), 'MENU250.TXT')).toBe('the sysop drew this one\n');
});

test('the screen it replaces is recoverable afterwards', () => {
  write(imageScreens(), 'MENU250.TXT', '~WXMain Menu\n');
  write(volumeScreens(), 'MENU250.TXT', 'what the board had\n');

  deploy(root);

  // Overwriting is only safe because the old bytes are still there: an edit
  // made outside the admin leaves no evidence and would otherwise be lost.
  expect(read(volumeScreens(), 'MENU250.TXT.pre-deploy')).toBe('what the board had\n');
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

/**
 * The screen the sysop was actually looking at.
 *
 * MENU is a CONFERENCE screen and the resolver searches the conference's own
 * directory FIRST, `Conf<n>/Screens` second
 * (web/backend/src/screens/screen-resolution.ts:138-144), with
 * `findSecurityScreen` choosing `MENU250.TXT` for a level-250 caller. So this
 * board's main menu is `Conf1/MENU250.TXT` - a conference-ROOT file. Syncing
 * the Screens directories alone never touched it, and the root `Screens/MENU*`
 * that WAS synced is never reached, because the conference directory wins.
 *
 * The wipe was in the repo, the deploy fix was live, and the menu still did not
 * wipe.
 */
describe('the conference-root screens the resolver reads first', () => {
  const confDir = (side: 'image' | 'volume') => path.join(root, side, 'Conf1');

  beforeEach(() => {
    fs.mkdirSync(confDir('image'), { recursive: true });
    fs.mkdirSync(confDir('volume'), { recursive: true });
  });

  it("takes the repo's menu to a board that already has one", () => {
    write(confDir('image'), 'MENU250.TXT', '~WXMain Menu\n');
    write(confDir('volume'), 'MENU250.TXT', 'Main Menu\n');

    deploy(root);
    deploy(root);

    expect(read(confDir('volume'), 'MENU250.TXT')).toBe('~WXMain Menu\n');
  });

  it('leaves the conference DATA alone - a DIR listing is not a screen', () => {
    fs.mkdirSync(path.join(confDir('image'), 'MsgBase'), { recursive: true });
    write(path.join(confDir('image'), 'MsgBase'), 'HighMsgNum.txt', 'from the image\n');
    write(confDir('image'), 'DIR1', 'DEMO.LHA      1024  01-01-26  a file\n');

    fs.mkdirSync(path.join(confDir('volume'), 'MsgBase'), { recursive: true });
    write(path.join(confDir('volume'), 'MsgBase'), 'HighMsgNum.txt', 'the board\'s own\n');
    write(confDir('volume'), 'DIR1', 'REAL.LHA      2048  02-02-26  the board\'s own listing\n');

    deploy(root);
    deploy(root);

    // A conference root is mostly not screens. Sweeping it wholesale would
    // overwrite the board's message base pointers and its file listings.
    expect(read(path.join(confDir('volume'), 'MsgBase'), 'HighMsgNum.txt')).toBe("the board's own\n");
    expect(read(confDir('volume'), 'DIR1')).toBe("REAL.LHA      2048  02-02-26  the board's own listing\n");
  });

  it('carries the .GR variant a graphics caller is served', () => {
    write(confDir('image'), 'menu250.txt.GR', '~WXgraphics menu\n');

    deploy(root);

    expect(read(confDir('volume'), 'menu250.txt.GR')).toBe('~WXgraphics menu\n');
  });
});
