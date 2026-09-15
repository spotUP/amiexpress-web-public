/**
 * A setting the sysop saved survives the next deploy.
 *
 * `door-settings.service.ts` writes the file each door's manifest names as its
 * `cfgFile` - `Doors/emp_tools/Bulls.CFG`, `joincnf.cfg`, and the rest. Those
 * files are tracked in git and shipped in the image, and the entrypoint's
 * Doors pass was one blanket `tar` stream, so every boot put the image's copy
 * back: DUAL_LISTING, 39 conference masks and 20 bulletin titles were reverted
 * by every deploy, silently.
 *
 * The cure is the one Commands already uses - the cfg files leave the blanket
 * tar and join the tracked set, where the image leads until the sysop takes a
 * file over.
 *
 * Driven through the real shell out of the real entrypoint: re-implementing
 * the rule in TypeScript would prove nothing about the script that runs.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The manifest helpers and sync_tracked_case_aware, lifted verbatim. */
function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('sync_image_owned() {');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('sync_tracked_case_aware and its helpers were not found in docker-entrypoint.sh');
  }
  return source.slice(start, end);
}

/**
 * The list the tar loop iterates. It lives above the sync helpers now, so the
 * slice below no longer carries it - and an unset list syncs nothing at all,
 * with every assertion here failing for a reason that is not the subject.
 */
function extractCodeSyncDirs(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const line = /^CODE_SYNC_DIRS="[^"]*"$/m.exec(source);
  if (!line) throw new Error('CODE_SYNC_DIRS was not found in docker-entrypoint.sh');
  return line[0];
}

/** The real cfg-discovery and Doors sync, lifted verbatim from the entrypoint. */
function extractDoorsSync(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('    DOOR_CFG_LIST=$(mktemp)');
  const end = source.indexOf('rm -f "$DOOR_CFG_LIST" "$DOOR_CFG_EXCLUDES"');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('the Doors sync was not found in docker-entrypoint.sh');
  }
  return `${extractCodeSyncDirs()}\n${source.slice(start, end + 'rm -f "$DOOR_CFG_LIST" "$DOOR_CFG_EXCLUDES"'.length)}`;
}

function stage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-cfg-deploy-'));
  for (const side of ['image', 'volume']) {
    fs.mkdirSync(path.join(root, side, 'Doors', 'emp_tools'), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, 'image', 'Doors', 'emp_tools', 'door.settings.json'),
    JSON.stringify({
      command: 'B',
      cfgFile: 'Bulls.CFG',
      cfgFormat: 'empire',
      settings: [{ key: 'join', label: 'Join', type: 'string', cfgFile: 'joincnf.cfg', cfgKey: 'J' }],
    })
  );
  // What the image ships.
  fs.writeFileSync(path.join(root, 'image', 'Doors', 'emp_tools', 'Bulls.CFG'), 'DUAL_LISTING       NO\n');
  fs.writeFileSync(path.join(root, 'image', 'Doors', 'emp_tools', 'joincnf.cfg'), 'J=0\n');
  // An ordinary door file, which must still be overwritten by the image.
  fs.writeFileSync(path.join(root, 'image', 'Doors', 'emp_tools', 'readme.txt'), 'from the image\n');
  return root;
}

/** One boot: the real Doors pass, over a temp image/volume pair. */
function boot(root: string): void {
  const script = `
    set -u
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${extractFunctions()}
    TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
    ${extractDoorsSync()}
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    exit 0
  `;
  execFileSync('bash', ['-c', script], { encoding: 'utf8' });
}

const read = (root: string, name: string) =>
  fs.readFileSync(path.join(root, 'volume', 'Doors', 'emp_tools', name), 'utf8');

describe('a deploy over a board whose sysop has saved door settings', () => {
  it('keeps what the sysop saved in every cfg the manifest names', () => {
    const root = stage();
    boot(root); // first boot: the image places the files

    expect(read(root, 'Bulls.CFG')).toBe('DUAL_LISTING       NO\n');

    // The sysop saves the form; the service writes the cfg.
    fs.writeFileSync(
      path.join(root, 'volume', 'Doors', 'emp_tools', 'Bulls.CFG'),
      'DUAL_LISTING       YES\n'
    );
    fs.writeFileSync(path.join(root, 'volume', 'Doors', 'emp_tools', 'joincnf.cfg'), 'J=1\n');

    boot(root); // the next deploy

    expect(read(root, 'Bulls.CFG')).toBe('DUAL_LISTING       YES\n');
    expect(read(root, 'joincnf.cfg')).toBe('J=1\n');
  });

  it('still lets the image lead a cfg the sysop has never touched', () => {
    const root = stage();
    boot(root);

    fs.writeFileSync(
      path.join(root, 'image', 'Doors', 'emp_tools', 'Bulls.CFG'),
      'DUAL_LISTING       NO\nNEW_KEY            1\n'
    );
    boot(root);

    expect(read(root, 'Bulls.CFG')).toContain('NEW_KEY');
  });

  it('still overwrites an ordinary door file from the image', () => {
    const root = stage();
    boot(root);
    fs.writeFileSync(path.join(root, 'volume', 'Doors', 'emp_tools', 'readme.txt'), 'local scribble\n');

    boot(root);

    expect(read(root, 'readme.txt')).toBe('from the image\n');
  });
});
