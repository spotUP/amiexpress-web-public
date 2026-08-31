/**
 * A deploy must stop reverting what the admin saves.
 *
 * `docker-entrypoint.sh` classified ComputerList.info, Drives.info,
 * ScreenTypes.info and ConfConfig.info as IMAGE-OWNED - "always overwrite the
 * volume" - under a comment asserting "there is no sysop/admin path that
 * legitimately modifies these". There is: they are exactly what the admin's
 * Computers, Drives, Screen Types and Conferences pages write. Every
 * Commands/BBSCmd/*.info went the same way through a blanket directory sync,
 * so every door edit was reverted too. The overwrite was even logged as
 * "hash drift" - the drift was the sysop.
 *
 * Seeding-once-and-never-updating is not the answer either: a genuine fix in
 * the image would then never reach a board, silently. So the entrypoint
 * remembers what the last deploy WROTE, and the rules below follow from that.
 *
 * These drive the real shell function out of the real entrypoint, because the
 * logic lives in shell and a TypeScript re-implementation would prove nothing
 * about it.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** Run one deploy over a temp image/volume pair, using the real sync_tracked. */
function deploy(root: string): string {
  const script = `
    set -eu
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${extractFunctions()}
    TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0
    rm -f "$DEPLOY_MANIFEST_NEXT"
    for f in $(cd "$DEFAULT_DATA_DIR" && find . -type f | sed 's|^\\./||'); do sync_tracked "$f"; done
    [ -f "$DEPLOY_MANIFEST_NEXT" ] && mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    echo "created=$TRACKED_CREATED updated=$TRACKED_UPDATED kept=$TRACKED_KEPT adopted=$TRACKED_ADOPTED"
  `;
  return execFileSync('sh', ['-c', script], { encoding: 'utf8' }).trim();
}

/**
 * The manifest helpers, lifted verbatim from the entrypoint.
 *
 * Copying them into the test would let the two drift, which is the whole
 * failure mode this file exists to prevent.
 */
function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"');
  const end = source.indexOf('sync_image_owned() {');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('sync_tracked and its helpers were not found in docker-entrypoint.sh');
  }
  return source.slice(start, end);
}

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
  fs.mkdirSync(path.join(root, 'image'), { recursive: true });
  fs.mkdirSync(path.join(root, 'volume'), { recursive: true });
  return root;
}

const write = (p: string, s: string) => fs.writeFileSync(p, s);
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('what a deploy does to a file the sysop can edit', () => {
  let root: string;
  const img = (n: string) => path.join(root, 'image', n);
  const vol = (n: string) => path.join(root, 'volume', n);

  beforeEach(() => { root = makeRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('changes nothing on the first run, having no baseline to judge by', () => {
    write(img('ComputerList.info'), 'IMAGE');
    write(vol('ComputerList.info'), 'SYSOP EDIT');

    const out = deploy(root);

    expect(read(vol('ComputerList.info'))).toBe('SYSOP EDIT');
    expect(out).toContain('adopted=1');
  });

  it('keeps an edited file while updating an untouched one', () => {
    write(img('a.info'), 'v1');
    write(img('b.info'), 'v1');
    write(vol('a.info'), 'SYSOP EDIT');
    write(vol('b.info'), 'v1');
    deploy(root);

    write(img('a.info'), 'v2');
    write(img('b.info'), 'v2');
    const out = deploy(root);

    expect(read(vol('a.info'))).toBe('SYSOP EDIT');
    expect(read(vol('b.info'))).toBe('v2');
    expect(out).toContain('kept=1');
    expect(out).toContain('updated=1');
  });

  it('goes on keeping it, deploy after deploy', () => {
    write(img('a.info'), 'v1');
    write(vol('a.info'), 'SYSOP EDIT');
    deploy(root);
    for (const v of ['v2', 'v3', 'v4']) {
      write(img('a.info'), v);
      deploy(root);
    }
    expect(read(vol('a.info'))).toBe('SYSOP EDIT');
  });

  it('creates a file the image has just added', () => {
    write(img('a.info'), 'v1');
    write(vol('a.info'), 'v1');
    deploy(root);

    write(img('NEWDOOR.info'), 'brand new');
    const out = deploy(root);

    expect(read(vol('NEWDOOR.info'))).toBe('brand new');
    expect(out).toContain('created=1');
  });

  it('gives control back once the board and the image agree again', () => {
    // Without this a file stayed sysop-owned for ever and never took another
    // update, which is the failure the seed-once approach has.
    write(img('a.info'), 'v1');
    write(vol('a.info'), 'SYSOP EDIT');
    deploy(root);
    write(img('a.info'), 'v2');
    deploy(root);
    expect(read(vol('a.info'))).toBe('SYSOP EDIT');

    write(vol('a.info'), 'v2');   // the sysop reverts
    deploy(root);
    write(img('a.info'), 'v3');   // and the image moves on
    deploy(root);

    expect(read(vol('a.info'))).toBe('v3');
  });

  it('never loses a file it decided to keep', () => {
    write(img('a.info'), 'v1');
    write(vol('a.info'), 'SYSOP EDIT');
    deploy(root);
    fs.rmSync(img('a.info'));      // the image stops shipping it
    deploy(root);

    expect(fs.existsSync(vol('a.info'))).toBe(true);
    expect(read(vol('a.info'))).toBe('SYSOP EDIT');
  });
});
