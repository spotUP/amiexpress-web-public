/**
 * A permission the sysop granted survives the next deploy.
 *
 * Access/ACS.<level>.info was IMAGE-OWNED, on the premise written into the
 * entrypoint itself: "pure permission tables, never edited by the sysop". The
 * admin's Security page edits exactly these files - it is the supported way to
 * grant a permission - so every deploy put the repository's copy back and threw
 * the board's security configuration away.
 *
 * Caught on 2026-09-14. ACS.OVERRIDE_TIMELIMIT was granted on levels 50, 60 and
 * 255 to answer "users above level 30 do not have unlimited time"; the deploy
 * that shipped the fix reverted all three. Level 30 survived only because
 * ACS.30.info does not exist in the repository - a file the image never held
 * cannot be restored over.
 *
 * Driven through the real shell, out of the real entrypoint: re-implementing
 * the rule in TypeScript would prove nothing about the script that runs.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The Access pass, lifted verbatim from the entrypoint. */
function extractAccessSync(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('if [ -d "$DEFAULT_DATA_DIR/Access" ]; then');
  if (start === -1) throw new Error('the Access pass was not found in docker-entrypoint.sh');
  const end = source.indexOf('\nfi\n', start);
  if (end === -1) throw new Error('the Access pass is unterminated in docker-entrypoint.sh');
  return source.slice(start, end + '\nfi\n'.length);
}

function stage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acs-deploy-'));
  fs.mkdirSync(path.join(root, 'image', 'Access'), { recursive: true });
  fs.mkdirSync(path.join(root, 'volume', 'Access'), { recursive: true });
  return root;
}

function runEntrypointPass(root: string, env: NodeJS.ProcessEnv = {}): string {
  const script = [
    'set -e',
    'DEFAULT_DATA_DIR="$1"',
    'BBS_DATA_DIR="$2"',
    extractAccessSync(),
  ].join('\n');

  return execFileSync('sh', ['-c', script, 'entrypoint', path.join(root, 'image'), path.join(root, 'volume')], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

const image = (root: string, name: string) => path.join(root, 'image', 'Access', name);
const volume = (root: string, name: string) => path.join(root, 'volume', 'Access', name);

describe('Access files across a deploy', () => {
  let root: string;

  beforeEach(() => { root = stage(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('seeds a level the board does not have yet', () => {
    fs.writeFileSync(image(root, 'ACS.10.info'), 'ACS.DOWNLOAD');

    const out = runEntrypointPass(root);

    expect(fs.readFileSync(volume(root, 'ACS.10.info'), 'utf8')).toBe('ACS.DOWNLOAD');
    expect(out).toContain('seeded from image (first run)');
  });

  it('leaves a level the sysop edited exactly as it is', () => {
    // The image's table, and the board's - which now grants unlimited time.
    fs.writeFileSync(image(root, 'ACS.50.info'), 'ACS.DOWNLOAD');
    fs.writeFileSync(volume(root, 'ACS.50.info'), 'ACS.DOWNLOAD\nACS.OVERRIDE_TIMELIMIT');

    runEntrypointPass(root);

    expect(fs.readFileSync(volume(root, 'ACS.50.info'), 'utf8')).toContain('ACS.OVERRIDE_TIMELIMIT');
  });

  it('does not touch an AREA or PRESET file either', () => {
    fs.writeFileSync(image(root, 'AREA.Elite.info'), 'image');
    fs.writeFileSync(volume(root, 'AREA.Elite.info'), 'the sysop chose this');

    runEntrypointPass(root);

    expect(fs.readFileSync(volume(root, 'AREA.Elite.info'), 'utf8')).toBe('the sysop chose this');
  });

  it('restores the image tables when a sysop asks for it', () => {
    fs.writeFileSync(image(root, 'ACS.50.info'), 'ACS.DOWNLOAD');
    fs.writeFileSync(volume(root, 'ACS.50.info'), 'whatever this board did');

    const out = runEntrypointPass(root, { FORCE_REINIT_CONFIG: '1' });

    expect(fs.readFileSync(volume(root, 'ACS.50.info'), 'utf8')).toBe('ACS.DOWNLOAD');
    expect(out).toContain('FORCE_REINIT_CONFIG');
  });

  it('is not the hash-drift rule any more - a differing file is not a stale one', () => {
    // The defect in one line: the image and the volume disagree BECAUSE the
    // sysop changed something, and that used to be read as drift to correct.
    fs.writeFileSync(image(root, 'ACS.255.info'), 'ACS.SYSOP_COMMANDS');
    fs.writeFileSync(volume(root, 'ACS.255.info'), 'ACS.SYSOP_COMMANDS\nACS.OVERRIDE_TIMELIMIT');

    runEntrypointPass(root);

    expect(fs.readFileSync(volume(root, 'ACS.255.info'), 'utf8').split('\n')).toHaveLength(2);
  });
});
