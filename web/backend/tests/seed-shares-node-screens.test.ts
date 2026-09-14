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

/**
 * A board that is already RUNNING gets the same shape, without losing the
 * deploy that just happened.
 *
 * The image's template is collapsed at build time; a board seeded before that
 * never was. Its `Node<n>.info` is volume-owned (seeded once), so its nodes
 * still read `Node<n>/` - forty-one copies no deploy refreshes - while the
 * deploy keeps `Screens/Node/` fresh for nobody. Found 2026-09-07: a BBSTITLE
 * fix landed three times and the live log still read Node1/BBSTITLE.txt.
 *
 * Run at boot (server/initialization.ts) in `existingSharedWins` mode, on a
 * board like the live one: every node holds the OLD generation, the deploy
 * has already put the NEW one in `Screens/Node/`, and one node has art of its
 * own. The proofs go through `resolveNodeScreenDir`, the function the loader
 * asks - an icon that says SCREENS is nothing until the resolver reads it.
 */
describe('a running board collapses its node screens without undoing the deploy', () => {
  const OLD_TITLE = Buffer.from([0x1b, 0x5b, 0x35, 0x3b, 0x33, 0x33, 0x6d, 0x7c, 0x0a]); // ESC[5;33m|
  const NEW_TITLE = Buffer.from([0x1b, 0x5b, 0x33, 0x33, 0x3b, 0x31, 0x30, 0x30, 0x6d, 0x7c, 0x0a]); // ESC[33;100m|
  const NEWER_TITLE = Buffer.concat([NEW_TITLE, Buffer.from('v3\n')]);
  const OWN_LOGON = Buffer.concat([LOGON, Buffer.from('node one only\n')]);
  const NODES = [0, 1, 2, 3, 4, 5];
  const DISSENTER = 1;
  let board: string;

  /** The live board's shape: seeded before the collapse existed, then deployed. */
  function runningBoard(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'running-board-'));
    fs.writeFileSync(path.join(dir, '.initialized'), 'seeded\n');
    for (const n of NODES) {
      const nodeDir = path.join(dir, `Node${n}`);
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.writeFileSync(path.join(nodeDir, 'BBSTITLE.txt'), OLD_TITLE);
      fs.writeFileSync(path.join(nodeDir, 'Logon.txt'), n === DISSENTER ? OWN_LOGON : LOGON);
      fs.writeFileSync(path.join(nodeDir, 'DOOR.SYS'), 'dropfile\n');
      // The icon a seeded board has: real, with the node's own settings on it.
      fs.copyFileSync(path.join(REPO, 'Node2.info'), path.join(dir, `Node${n}.info`));
    }
    // What the deploy just did: the shared directory holds the new generation.
    fs.mkdirSync(path.join(dir, 'Screens', 'Node'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Screens', 'Node', 'BBSTITLE.txt'), NEW_TITLE);
    return dir;
  }

  const read = (rel: string) => fs.readFileSync(path.join(board, rel));
  const exists = (rel: string) => fs.existsSync(path.join(board, rel));
  const shared = () => path.resolve(board, 'Screens', 'Node');

  afterEach(() => {
    if (board) fs.rmSync(board, { recursive: true, force: true });
  });

  test('the deployed shared copy stays, and the nodes\' old bytes are kept beside it', () => {
    board = runningBoard();
    const report = collapseSeedNodeScreens(board, { existingSharedWins: true });

    expect(read('Screens/Node/BBSTITLE.txt').equals(NEW_TITLE)).toBe(true);
    expect(read('Screens/Node/BBSTITLE.txt.pre-collapse').equals(OLD_TITLE)).toBe(true);
    expect(report.sharedKept).toEqual(['BBSTITLE.txt']);
    // Logon had no shared copy yet, so the nodes' own version is what arrives.
    expect(read('Screens/Node/Logon.txt').equals(LOGON)).toBe(true);
  });

  test('every agreeing node now READS the shared directory, with its other settings intact', () => {
    board = runningBoard();
    const before = readTooltypeMap(path.join(board, 'Node2.info'));
    collapseSeedNodeScreens(board, { existingSharedWins: true });

    for (const n of NODES.filter(n => n !== DISSENTER)) {
      expect({ n, dir: path.resolve(resolveNodeScreenDir(board, n)) }).toEqual({ n, dir: shared() });
      expect({ n, gone: !exists(`Node${n}/BBSTITLE.txt`) }).toEqual({ n, gone: true });
    }
    const after = readTooltypeMap(path.join(board, 'Node2.info'));
    for (const [key, value] of before) {
      expect({ key, value: after.get(key) }).toEqual({ key, value });
    }
  });

  test('the node with its own art keeps its directory - and still gets the new BBSTITLE', () => {
    board = runningBoard();
    const report = collapseSeedNodeScreens(board, { existingSharedWins: true });

    const own = path.resolve(board, `Node${DISSENTER}`);
    expect(path.resolve(resolveNodeScreenDir(board, DISSENTER))).toBe(own);
    expect(read(`Node${DISSENTER}/Logon.txt`).equals(OWN_LOGON)).toBe(true);
    // The screen it agreed with everyone about follows the shared copy.
    expect(read(`Node${DISSENTER}/BBSTITLE.txt`).equals(NEW_TITLE)).toBe(true);
    expect(read(`Node${DISSENTER}/BBSTITLE.txt.pre-collapse`).equals(OLD_TITLE)).toBe(true);
    expect(report.refreshed).toEqual([path.join(`Node${DISSENTER}`, 'BBSTITLE.txt')]);
  });

  test('the next deploy reaches the kept node too, and never its own art', () => {
    board = runningBoard();
    collapseSeedNodeScreens(board, { existingSharedWins: true });

    // A later deploy: the shared copy moves on; the sysop also edits the
    // kept node's own Logon again.
    fs.writeFileSync(path.join(board, 'Screens', 'Node', 'BBSTITLE.txt'), NEWER_TITLE);
    fs.writeFileSync(path.join(board, 'Screens', 'Node', 'Logon.txt'), Buffer.concat([LOGON, Buffer.from('v2\n')]));
    const report = collapseSeedNodeScreens(board, { existingSharedWins: true });

    expect(read(`Node${DISSENTER}/BBSTITLE.txt`).equals(NEWER_TITLE)).toBe(true);
    expect(read(`Node${DISSENTER}/Logon.txt`).equals(OWN_LOGON)).toBe(true);
    expect(report.refreshed).toEqual([path.join(`Node${DISSENTER}`, 'BBSTITLE.txt')]);
    expect(report.pointed).toEqual([]);
    // The nodes that share were not written into, and still share.
    expect(exists('Node2/BBSTITLE.txt')).toBe(false);
    expect(path.resolve(resolveNodeScreenDir(board, 2))).toBe(shared());
  });

  test('a minority that keeps its own version of a screen the shared directory has is not outvoted later', () => {
    board = runningBoard();
    // Nodes 3, 4, 5 have their own awaitscreen; nodes 0, 1, 2 the seeded one,
    // which is what the shared directory already holds.
    const SEEDED = Buffer.from('await seeded\n');
    const THEIRS = Buffer.from('await theirs\n');
    for (const n of NODES) fs.writeFileSync(path.join(board, `Node${n}`, 'awaitscreen.txt'), n >= 3 ? THEIRS : SEEDED);
    fs.writeFileSync(path.join(board, 'Screens', 'Node', 'awaitscreen.txt'), SEEDED);
    collapseSeedNodeScreens(board, { existingSharedWins: true });
    for (const n of [0, 2]) expect(path.resolve(resolveNodeScreenDir(board, n))).toBe(shared());

    // Second run: only nodes 1, 3, 4, 5 still have directories. Three of the
    // four agree on THEIRS - a majority among the leftovers, and not a
    // majority of the board.
    collapseSeedNodeScreens(board, { existingSharedWins: true });
    for (const n of [3, 4, 5]) {
      expect({ n, dir: path.resolve(resolveNodeScreenDir(board, n)) }).toEqual({ n, dir: path.resolve(board, `Node${n}`) });
      expect({ n, art: read(`Node${n}/awaitscreen.txt`).equals(THEIRS) }).toEqual({ n, art: true });
    }
    expect(read('Screens/Node/awaitscreen.txt').equals(SEEDED)).toBe(true);
  });

  test('without the flag - the image build - the nodes\' bytes are what the shared directory gets', () => {
    board = runningBoard();
    collapseSeedNodeScreens(board);
    expect(read('Screens/Node/BBSTITLE.txt').equals(OLD_TITLE)).toBe(true);
  });
});

/**
 * An EMPTY shared copy is not a newer generation of anything.
 *
 * `existingSharedWins` reasons that the deploy refreshed `Screens/Node/` and
 * the nodes hold the older bytes. That is true for a real screen. It was
 * never true for a placeholder: on 2026-09-08 a two-byte `Logon.txt` sitting
 * in the shared directory beat six nodes' 160-byte welcome screens, which
 * went to `.pre-collapse`, and every caller met a cleared screen and a pause
 * at login. Nothing looked at whether the winner had anything in it.
 *
 * Both arms are pinned: the nodes that shed their directory, and the node
 * that keeps one and follows the shared copy for screens it agrees about.
 */
describe('a shared copy with nothing in it never beats a node that has content', () => {
  const REAL_LOGON = Buffer.concat([LOGON, Buffer.from('welcome to the board\n')]);
  const NODES = [0, 1, 2, 3, 4, 5];
  const DISSENTER = 1;
  let board: string;

  /** The 2026-09-08 shape: a placeholder in the shared directory, art in the nodes. */
  function boardWithHollowShared(stub: Buffer): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-shared-'));
    fs.writeFileSync(path.join(dir, '.initialized'), 'seeded\n');
    for (const n of NODES) {
      const nodeDir = path.join(dir, `Node${n}`);
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.writeFileSync(path.join(nodeDir, 'Logon.txt'), REAL_LOGON);
      // One screen the dissenter differs about, so it keeps its directory and
      // the second arm - the refresh of a kept node - is exercised too.
      fs.writeFileSync(path.join(nodeDir, 'joined.txt'), n === DISSENTER ? Buffer.from('mine\n') : JOINED);
      fs.copyFileSync(path.join(REPO, 'Node2.info'), path.join(dir, `Node${n}.info`));
    }
    fs.mkdirSync(path.join(dir, 'Screens', 'Node'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Screens', 'Node', 'Logon.txt'), stub);
    return dir;
  }

  const read = (rel: string) => fs.readFileSync(path.join(board, rel));

  afterEach(() => {
    if (board) fs.rmSync(board, { recursive: true, force: true });
  });

  test.each([
    ['zero bytes', Buffer.alloc(0)],
    ['the `~\\n` stub the seeder writes', Buffer.from('~\n')],
  ])('%s loses to the nodes\' art, and is kept beside it', (_name, stub) => {
    board = boardWithHollowShared(stub as Buffer);

    const report = collapseSeedNodeScreens(board, { existingSharedWins: true });

    expect(read('Screens/Node/Logon.txt').equals(REAL_LOGON)).toBe(true);
    // Nothing is ever deleted - the placeholder is kept the way a losing copy
    // always is.
    expect(read('Screens/Node/Logon.txt.hollow-replaced').equals(stub as Buffer)).toBe(true);
    expect(report.sharedKept).not.toContain('Logon.txt');
  });

  test('a node that keeps its own directory is not emptied either', () => {
    board = boardWithHollowShared(Buffer.alloc(0));

    collapseSeedNodeScreens(board, { existingSharedWins: true });

    expect(read(`Node${DISSENTER}/Logon.txt`).equals(REAL_LOGON)).toBe(true);
  });

  test('a shared copy WITH content still wins, which is what the flag is for', () => {
    const NEWER = Buffer.concat([LOGON, Buffer.from('deployed today\n')]);
    board = boardWithHollowShared(NEWER);

    const report = collapseSeedNodeScreens(board, { existingSharedWins: true });

    expect(read('Screens/Node/Logon.txt').equals(NEWER)).toBe(true);
    expect(read('Screens/Node/Logon.txt.pre-collapse').equals(REAL_LOGON)).toBe(true);
    expect(report.sharedKept).toContain('Logon.txt');
  });
});
