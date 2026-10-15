/**
 * A file dropped from the image used to live on the volume for ever.
 *
 * `docker-entrypoint.sh` syncs Doors/ with `tar cf - | tar xf -`, and
 * extraction only WRITES. For a door's compiled dist/ that is not a stale
 * file but a live one - the door loads what is in dist/, so a module that was
 * renamed or deleted in git keeps running next to its replacement. Eight such
 * orphans were removed by hand from Doors/sprite-editor/dist on 2026-09-02;
 * before that the only cure was the hand-maintained ORPHANS list, which needs
 * somebody to remember.
 *
 * The prune is narrow on purpose, and the narrowness is what these tests are
 * really about: a door DOORREPO installed at runtime exists ONLY on the
 * volume, so mirroring the image over it would delete the whole door.
 *
 * This drives the real shell function out of the real entrypoint. A
 * TypeScript re-implementation would prove nothing about the shell that
 * actually runs on the board.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The prune, lifted verbatim - copying it here would let the two drift. */
function extractFunction(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  // From the extension whitelist, which the function reads, so the test
  // cannot pass against a list it invented itself.
  const start = source.indexOf('    PRUNABLE_DIST_EXTS=');
  if (start === -1 || source.indexOf('    prune_image_door_dists() {', start) === -1) {
    throw new Error('prune_image_door_dists() was not found in docker-entrypoint.sh');
  }
  const end = source.indexOf('\n    }\n', start);
  if (end === -1) {
    throw new Error('prune_image_door_dists() has no closing brace at its own indentation');
  }
  return source.slice(start, end + '\n    }\n'.length);
}

/** Run the prune once over a temp image/volume pair. */
function prune(root: string): string {
  const script = `
    set -u
    DEFAULT_DATA_DIR="${root}/image"
    BBS_DATA_DIR="${root}/volume"
    ${extractFunction()}
    prune_image_door_dists
  `;
  return execFileSync('bash', ['-c', script], { encoding: 'utf8' }).trim();
}

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-dist-prune-'));
  fs.mkdirSync(path.join(root, 'image', 'Doors'), { recursive: true });
  fs.mkdirSync(path.join(root, 'volume', 'Doors'), { recursive: true });
  return root;
}

describe('what a deploy does to a door dist/ the image no longer ships', () => {
  let root: string;

  const img = (rel: string) => path.join(root, 'image', 'Doors', rel);
  const vol = (rel: string) => path.join(root, 'volume', 'Doors', rel);
  const write = (p: string, body: string) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };

  beforeEach(() => { root = makeRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('removes a dist file the image stopped shipping', () => {
    write(img('sprite-editor/dist/index.js'), 'current');
    write(vol('sprite-editor/dist/index.js'), 'current');
    write(vol('sprite-editor/dist/old-palette.js'), 'renamed away in git');

    const out = prune(root);

    expect(fs.existsSync(vol('sprite-editor/dist/old-palette.js'))).toBe(false);
    expect(fs.existsSync(vol('sprite-editor/dist/index.js'))).toBe(true);
    expect(out).toContain('Pruned 1 orphaned door dist file(s)');
  });

  it('leaves the files the image still ships exactly as they are', () => {
    // The volume's copy is what the last sync wrote; the prune has no
    // business rewriting content, only removing what is gone.
    write(img('grandmaster/dist/index.js'), 'from the image');
    write(vol('grandmaster/dist/index.js'), 'from the image');

    const out = prune(root);

    expect(fs.readFileSync(vol('grandmaster/dist/index.js'), 'utf8')).toBe('from the image');
    expect(out).toContain('Pruned 0 orphaned door dist file(s)');
  });

  it('never touches a door the image does not ship', () => {
    // DOORREPO installs at runtime: this door's ONLY copy is the volume's.
    // Mirroring the image over it would delete the door.
    write(img('grandmaster/dist/index.js'), 'shipped');
    write(vol('grandmaster/dist/index.js'), 'shipped');
    write(vol('emp_tools/dist/index.js'), 'installed by DOORREPO');
    write(vol('emp_tools/dist/lib/util.js'), 'installed by DOORREPO');

    prune(root);

    expect(fs.existsSync(vol('emp_tools/dist/index.js'))).toBe(true);
    expect(fs.existsSync(vol('emp_tools/dist/lib/util.js'))).toBe(true);
  });

  it('never reaches outside dist/', () => {
    // A door writes its own runtime state next to its code, and the image
    // has no opinion about any of it.
    write(img('bug-tracker/dist/index.js'), 'shipped');
    write(vol('bug-tracker/dist/index.js'), 'shipped');
    write(vol('bug-tracker/bugs.db'), 'live data');
    write(vol('bug-tracker/door.log'), 'live log');
    write(vol('bug-tracker/node_modules/better-sqlite3/index.js'), 'native dep');

    prune(root);

    expect(fs.existsSync(vol('bug-tracker/bugs.db'))).toBe(true);
    expect(fs.existsSync(vol('bug-tracker/door.log'))).toBe(true);
    expect(fs.existsSync(vol('bug-tracker/node_modules/better-sqlite3/index.js'))).toBe(true);
  });

  it('keeps a door\'s runtime data even when it lives inside dist/', () => {
    // A dry run against the live volume on 2026-09-02 found
    // frogger/dist/highscores.json and super-qix/dist/highscores.json:
    // the players' scores, written by the door, present in no image. dist/
    // is not purely image-owned on this board, so the prune whitelists
    // build output by extension and leaves everything else alone.
    write(img('frogger/dist/index.js'), 'shipped');
    write(vol('frogger/dist/index.js'), 'shipped');
    write(vol('frogger/dist/highscores.json'), '{"ALF":31337}');
    write(vol('frogger/dist/scores.db'), 'binary');
    write(vol('frogger/dist/README'), 'no extension at all');
    write(vol('frogger/dist/stale.js'), 'gone from the image');

    const out = prune(root);

    expect(fs.readFileSync(vol('frogger/dist/highscores.json'), 'utf8')).toBe('{"ALF":31337}');
    expect(fs.existsSync(vol('frogger/dist/scores.db'))).toBe(true);
    expect(fs.existsSync(vol('frogger/dist/README'))).toBe(true);
    expect(fs.existsSync(vol('frogger/dist/stale.js'))).toBe(false);
    expect(out).toContain('Pruned 1 orphaned door dist file(s)');
  });

  it('removes the whole shape of a renamed module', () => {
    // What the live dry run found in pengo: a source file moved, and its
    // .js, .d.ts and both .map files stayed behind to be loaded.
    write(img('pengo/dist/index.js'), 'shipped');
    write(vol('pengo/dist/index.js'), 'shipped');
    for (const suffix of ['js', 'js.map', 'd.ts', 'd.ts.map']) {
      write(vol(`pengo/dist/game/sprites.${suffix}`), 'renamed away');
    }

    const out = prune(root);

    expect(fs.existsSync(vol('pengo/dist/game'))).toBe(false);
    expect(out).toContain('Pruned 4 orphaned door dist file(s)');
  });

  it('refuses to prune against an empty image dist/', () => {
    // An empty source is a broken build or a half-copied image. The answer
    // to "the source looks empty" is never "delete the board's copy".
    fs.mkdirSync(img('doors-menu/dist'), { recursive: true });
    write(vol('doors-menu/dist/index.js'), 'the door the board is running');

    const out = prune(root);

    expect(fs.existsSync(vol('doors-menu/dist/index.js'))).toBe(true);
    expect(out).toContain('Pruned 0 orphaned door dist file(s)');
  });

  it('clears the directories the pruning emptied, and keeps dist/ itself', () => {
    write(img('theme-picker/dist/index.js'), 'current');
    write(vol('theme-picker/dist/index.js'), 'current');
    write(vol('theme-picker/dist/legacy/old.js'), 'a directory that is gone in git');

    prune(root);

    expect(fs.existsSync(vol('theme-picker/dist/legacy'))).toBe(false);
    expect(fs.existsSync(vol('theme-picker/dist'))).toBe(true);
  });

  it('prunes every door in one pass', () => {
    for (const door of ['sprite-editor', 'grandmaster', 'livechat']) {
      write(img(`${door}/dist/index.js`), 'current');
      write(vol(`${door}/dist/index.js`), 'current');
      write(vol(`${door}/dist/orphan.js`), 'gone from the image');
    }

    const out = prune(root);

    for (const door of ['sprite-editor', 'grandmaster', 'livechat']) {
      expect(fs.existsSync(vol(`${door}/dist/orphan.js`))).toBe(false);
    }
    expect(out).toContain('Pruned 3 orphaned door dist file(s)');
  });

  it('says nothing and survives a board with no doors at all', () => {
    expect(prune(root)).toContain('Pruned 0 orphaned door dist file(s)');
  });
});
