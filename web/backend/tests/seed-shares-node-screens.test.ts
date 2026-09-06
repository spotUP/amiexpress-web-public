/**
 * A fresh install gets ONE copy of each node screen, not forty-one.
 *
 * The image seeds `/app/default-data` by copying whole node directories out of
 * this repo, and this repo is a running 41-node board. Measured 2026-09-02 on
 * `origin/main`: 544 node screen files that are 16 distinct screens. A sysop
 * changing the logon art had 41 files to edit and no way to know which one
 * their board reads.
 *
 * The fix is AmiExpress's own: `SCREENS=<dir>` on `Node<n>.info` IS the node's
 * screen directory (ACP.e:2666-2673). These tests hold both halves - one copy
 * on disk AND a tooltype pointing every node at it - because either alone is a
 * board with no screens.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collapseSeedNodeScreens } from '../src/services/seed-node-screens';
import { readTooltypeMap, parseInfoFile } from '../src/utils/info-file.util';
import { resolveNodeScreenDir } from '../src/screens/screen-resolution';

const REPO = path.join(__dirname, '..', '..', '..');

/**
 * A screen the way the board's actually are: ANSI art with high-bit Amiga
 * bytes in it. Read as UTF-8 anywhere in the pipeline, 0xA1 comes back as
 * three bytes of U+FFFD and the art is destroyed silently.
 */
const LOGON = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0xdb, 0x0a]);
const JOINED = Buffer.from([0x1b, 0x5b, 0x33, 0x32, 0x6d, 0xe4, 0x0a]);
const NODE_COUNT = 41;

/** A template shaped like the one the Dockerfile builds. */
function seedTemplate(opts: { dissenter?: number } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-template-'));

  for (let n = 0; n < NODE_COUNT; n++) {
    const nodeDir = path.join(dir, `Node${n}`);
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(nodeDir, 'Logon.txt'),
      n === opts.dissenter ? Buffer.concat([LOGON, Buffer.from('own\n')]) : LOGON,
    );
    fs.writeFileSync(path.join(nodeDir, 'joined.txt'), JOINED);
    // Not screens: a node directory is mostly runtime state, and none of it
    // may be swept into a screen directory.
    fs.writeFileSync(path.join(nodeDir, 'DOOR.SYS'), 'dropfile\n');
    fs.mkdirSync(path.join(nodeDir, 'Playpen'), { recursive: true });
  }

  // The icons the image actually copies: nodes 0 to 6 only.
  for (let n = 0; n <= 6; n++) {
    fs.copyFileSync(path.join(REPO, 'Node2.info'), path.join(dir, `Node${n}.info`));
  }

  // A screen's own Workbench icon, which on an Amiga sits beside it as
  // `<file>.info`. This board ships eight of them.
  fs.copyFileSync(path.join(REPO, 'Node2.info'), path.join(dir, 'Node2', 'joined.txt.info'));
  fs.copyFileSync(path.join(REPO, 'Node2.info'), path.join(dir, 'Node5', 'Logon.txt.info'));

  return dir;
}

describe('the seeded board template shares its node screens', () => {
  let template: string;

  afterEach(() => {
    if (template) fs.rmSync(template, { recursive: true, force: true });
  });

  test('one copy of each screen exists, in the shared directory', () => {
    template = seedTemplate();
    const report = collapseSeedNodeScreens(template);

    expect(report.shared.map(s => s.name).sort()).toEqual(['Logon.txt', 'joined.txt']);

    const shared = path.join(template, 'Screens', 'Node');
    expect(fs.readdirSync(shared).sort())
      .toEqual(['Logon.txt', 'Logon.txt.info', 'joined.txt', 'joined.txt.info']);

    // Bytes, not text: the art must arrive byte for byte.
    expect(fs.readFileSync(path.join(shared, 'Logon.txt')).equals(LOGON)).toBe(true);

    const leftBehind = Array.from({ length: NODE_COUNT }, (_, n) => `Node${n}/Logon.txt`)
      .filter(rel => fs.existsSync(path.join(template, rel)));
    expect(leftBehind).toEqual([]);
  });

  test('every node icon declares SCREENS, so every node reads that copy', () => {
    template = seedTemplate();
    collapseSeedNodeScreens(template);

    for (let n = 0; n < NODE_COUNT; n++) {
      const icon = path.join(template, `Node${n}.info`);
      expect(readTooltypeMap(icon).get('SCREENS')).toBe('BBS:Screens/Node/');
      // Through the resolver the board itself uses, not by reading the file:
      // a tooltype the loader cannot follow is not a fix.
      expect(resolveNodeScreenDir(template, n)).toBe(path.join(template, 'Screens', 'Node'));
    }
  });

  test('a node with no icon is given a real Amiga icon, carrying nothing but SCREENS', () => {
    template = seedTemplate();
    const report = collapseSeedNodeScreens(template);

    // Nodes 7 and up ship no icon at all, so they had nowhere to declare it.
    expect(report.iconsCreated).toEqual(Array.from({ length: 34 }, (_, i) => i + 7));

    const created = parseInfoFile(path.join(template, 'Node7.info'));
    expect(created.isBinary).toBe(true);

    // The icon it was copied from carries the node-2 settings. Inheriting
    // those would be this step turning TELNET on for 34 nodes while it
    // tidied their screens.
    expect([...readTooltypeMap(path.join(template, 'Node7.info')).keys()]).toEqual(['SCREENS']);
    expect(readTooltypeMap(path.join(template, 'Node2.info')).has('TELNET')).toBe(true);
  });

  test('a node whose screen differs keeps its own directory, untouched', () => {
    template = seedTemplate({ dissenter: 5 });
    const report = collapseSeedNodeScreens(template);

    expect(report.pointed).not.toContain(5);
    expect(readTooltypeMap(path.join(template, 'Node5.info')).has('SCREENS')).toBe(false);
    expect(resolveNodeScreenDir(template, 5)).toBe(path.join(template, 'Node5'));

    const own = fs.readFileSync(path.join(template, 'Node5', 'Logon.txt'));
    expect(own.equals(Buffer.concat([LOGON, Buffer.from('own\n')]))).toBe(true);
    // It keeps its WHOLE set: SCREENS points at one directory, so a node that
    // reads its own must find everything there.
    expect(fs.existsSync(path.join(template, 'Node5', 'joined.txt'))).toBe(true);
  });

  test("a screen's icon travels with it, and never on its own", () => {
    template = seedTemplate();
    collapseSeedNodeScreens(template);

    // Moved: an icon left behind names a file that is no longer there.
    expect(fs.existsSync(path.join(template, 'Node2', 'joined.txt.info'))).toBe(false);
    expect(fs.existsSync(path.join(template, 'Screens', 'Node', 'joined.txt.info'))).toBe(true);
  });

  test('a node that keeps its own screen keeps that screen\'s icon too', () => {
    template = seedTemplate({ dissenter: 5 });
    collapseSeedNodeScreens(template);

    expect(fs.existsSync(path.join(template, 'Node5', 'Logon.txt.info'))).toBe(true);
    expect(fs.existsSync(path.join(template, 'Screens', 'Node', 'Logon.txt.info'))).toBe(false);
  });

  test('nothing but screens moves - a node directory is mostly runtime state', () => {
    template = seedTemplate();
    collapseSeedNodeScreens(template);

    expect(fs.existsSync(path.join(template, 'Node9', 'DOOR.SYS'))).toBe(true);
    expect(fs.existsSync(path.join(template, 'Node9', 'Playpen'))).toBe(true);
    expect(fs.existsSync(path.join(template, 'Screens', 'Node', 'DOOR.SYS'))).toBe(false);
  });

  test('running it twice changes nothing', () => {
    template = seedTemplate();
    collapseSeedNodeScreens(template);
    const after = fs.readFileSync(path.join(template, 'Screens', 'Node', 'Logon.txt'));

    const second = collapseSeedNodeScreens(template);
    expect(second.shared).toEqual([]);
    expect(fs.readFileSync(path.join(template, 'Screens', 'Node', 'Logon.txt')).equals(after)).toBe(true);
    expect(readTooltypeMap(path.join(template, 'Node7.info')).get('SCREENS')).toBe('BBS:Screens/Node/');
  });
});

describe('the image and the entrypoint still carry the shared shape', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  const entrypoint = fs.readFileSync(path.join(REPO, 'docker-entrypoint.sh'), 'utf8');

  test('the Dockerfile runs the collapse over /app/default-data', () => {
    // A service nothing calls is not a feature: without this line the image
    // ships the 41 copies again and every test above still passes.
    expect(dockerfile).toMatch(
      /collapse-default-screens\.ts[\s\\]+\/app\/default-data/,
    );
  });

  test('it runs after the node directories and icons are copied in', () => {
    const copyNodeDirs = dockerfile.lastIndexOf('COPY Node40 /app/default-data/Node40');
    // The icons arrive by wildcard since 742db4e07 (`COPY *.info`), not by
    // name. What matters is unchanged: whatever line carries Node<n>.info
    // into the image has to run before the collapse writes SCREENS onto it.
    const copyNodeIcons = dockerfile.lastIndexOf('COPY *.info');
    const collapse = dockerfile.indexOf('collapse-default-screens.ts');

    expect(copyNodeDirs).toBeGreaterThan(-1);
    expect(copyNodeIcons).toBeGreaterThan(-1);
    expect(collapse).toBeGreaterThan(copyNodeDirs);
    expect(collapse).toBeGreaterThan(copyNodeIcons);
  });

  test('every node the image seeds a directory for can have its icon reach the volume', () => {
    const seeded = [...dockerfile.matchAll(/^COPY Node(\d+) \/app\/default-data\/Node\d+/gm)]
      .map(m => Number(m[1]));
    expect(seeded.length).toBe(NODE_COUNT);

    const owned = /VOLUME_OWNED_INFO="([^"]*)"/.exec(entrypoint);
    expect(owned).not.toBeNull();
    const names = new Set((owned as RegExpExecArray)[1].split(/\s+/));

    // An icon that never reaches the volume leaves its node reading Node<n>/,
    // which after the collapse holds no screens at all.
    expect(seeded.filter(n => !names.has(`Node${n}.info`))).toEqual([]);
  });
});
