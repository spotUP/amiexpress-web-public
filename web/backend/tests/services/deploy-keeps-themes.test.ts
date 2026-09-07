/**
 * SP1 of the screen-themes spec, deploy half: a theme has to survive the thing
 * that has eaten every other artist-facing directory on this board.
 *
 * The spec chose a top-level `Themes/` over `Screens/themes/` for two measured
 * reasons, and both are asserted here rather than trusted:
 *
 *  - the tar sync loop over `Doors Screens Libs C` overwrites any volume path
 *    the image also has, so an artist's theme under `Screens/` would be
 *    replaced the day the repo shipped a file at the same path
 *  - `FORCE_REINIT_SCREENS=1` does `rm -rf` on `Screens/` and on every
 *    conference's `Screens/` - the switch a sysop reaches for when the board's
 *    art looks wrong, which is exactly when a theme experiment has gone wrong
 *
 * Driven through the entrypoint's own functions and its own `TRACKED_INFO`,
 * not a copy of either.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

function helpers(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('TRACKED_INFO="');
  const end = source.indexOf('# --- end of the deploy sync helpers');
  if (start === -1 || end === -1) throw new Error('the deploy sync helpers moved');
  return source.slice(start, end);
}

/** One deploy: the tracked .info files and the tracked screen/theme files. */
function deploy(root: string): void {
  const script = `
    set -eu
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${helpers()}
    TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
    rm -f "$DEPLOY_MANIFEST_NEXT"
    for f in $TRACKED_INFO; do sync_tracked "$f"; done
    list_tracked_screens | while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      sync_tracked_case_aware "$rel"
    done
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    exit 0
  `;
  execFileSync('sh', ['-c', script], { encoding: 'utf8' });
}

let root: string;
const image = (...p: string[]) => path.join(root, 'image', ...p);
const volume = (...p: string[]) => path.join(root, 'volume', ...p);

function write(full: string, body: string): void {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-deploy-'));
  fs.mkdirSync(image(), { recursive: true });
  fs.mkdirSync(volume(), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('the registry reaches a board, and a sysop edit to it is kept', () => {
  write(image('Themes.info'), 'TYPE.0=default\n');
  deploy(root);
  expect(fs.readFileSync(volume('Themes.info'), 'utf8')).toBe('TYPE.0=default\n');

  // The admin writes the registry - a theme created, an owner set - and the
  // image moves on underneath it. Tracked means the board's copy wins.
  write(volume('Themes.info'), 'TYPE.0=default\nTYPE.1=neon\n');
  write(image('Themes.info'), 'TYPE.0=default\nTYPE.1=shipped\n');
  deploy(root);

  expect(fs.readFileSync(volume('Themes.info'), 'utf8')).toBe('TYPE.0=default\nTYPE.1=neon\n');
});

test("a shipped theme's screens arrive, and update while the board leaves them alone", () => {
  write(image('Themes/reference-board/Board/BULL.TXT'), 'v1\n');
  deploy(root);
  expect(fs.readFileSync(volume('Themes/reference-board/Board/BULL.TXT'), 'utf8')).toBe('v1\n');

  write(image('Themes/reference-board/Board/BULL.TXT'), 'v2\n');
  deploy(root);
  expect(fs.readFileSync(volume('Themes/reference-board/Board/BULL.TXT'), 'utf8')).toBe('v2\n');
});

test("an artist's own theme is untouched - the image has no such path", () => {
  // What an artist uploads through the admin: a directory the image has never
  // heard of. Nothing in the deploy may reach it.
  write(volume('Themes/neon/Board/MENU.TXT'), '~WXthe artist drew this\n');
  write(volume('Themes/neon/Conf/1/MENU250.TXT'), 'and this\n');
  write(image('Themes/reference-board/Board/BULL.TXT'), 'a shipped theme\n');

  deploy(root);
  deploy(root);

  expect(fs.readFileSync(volume('Themes/neon/Board/MENU.TXT'), 'utf8')).toBe('~WXthe artist drew this\n');
  expect(fs.readFileSync(volume('Themes/neon/Conf/1/MENU250.TXT'), 'utf8')).toBe('and this\n');
});

test('an artist edit to a SHIPPED theme file is kept, and their deletion stays deleted', () => {
  write(image('Themes/reference-board/Board/BULL.TXT'), 'shipped\n');
  write(image('Themes/reference-board/Board/GOODBYE.TXT'), 'bye\n');
  deploy(root);

  write(volume('Themes/reference-board/Board/BULL.TXT'), 'the artist redrew it\n');
  fs.rmSync(volume('Themes/reference-board/Board/GOODBYE.TXT'));
  write(image('Themes/reference-board/Board/BULL.TXT'), 'a later version from the repo\n');
  deploy(root);

  expect(fs.readFileSync(volume('Themes/reference-board/Board/BULL.TXT'), 'utf8')).toBe('the artist redrew it\n');
  expect(fs.existsSync(volume('Themes/reference-board/Board/GOODBYE.TXT'))).toBe(false);
});

describe('the two directory rules the spec chose Themes/ to escape', () => {
  const entrypoint = fs.readFileSync(ENTRYPOINT, 'utf8');

  it('keeps Themes out of the tar sync loop, which overwrites what it finds', () => {
    // `for sync_dir in Doors Screens Libs C` extracts the image's archive over
    // the volume: every path the image also has is replaced.
    const loop = /for sync_dir in ([A-Za-z ]+); do/.exec(entrypoint);
    expect(loop).not.toBeNull();
    expect(loop![1].split(/\s+/)).not.toContain('Themes');
  });

  it('keeps Themes out of both FORCE_REINIT_SCREENS rm -rf paths', () => {
    const destructive = entrypoint.match(/rm -rf "\$BBS_DATA_DIR[^"]*"/g) ?? [];
    expect(destructive.length).toBeGreaterThan(0);
    for (const line of destructive) expect(line).not.toContain('Themes');
  });
});
