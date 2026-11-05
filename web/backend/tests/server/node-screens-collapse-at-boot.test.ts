/**
 * Boot collapses a deployed board's node screens - and only a deployed one.
 *
 * `collapseSeedNodeScreens` in `existingSharedWins` mode is proven by
 * tests/seed-shares-node-screens.test.ts. This file proves the other half:
 * that the REAL boot routine (`server/initialization.ts#initializeData`, the
 * function index.ts's start-up IIFE calls) runs it, on a volume the
 * entrypoint seeded, and leaves a developer's checkout alone. Delete the
 * `collapseNodeScreensOnBoot('Server')` call from `initializeData` and the
 * first test goes red; drop its `.initialized` gate and the second does.
 *
 * The proof goes through `resolveNodeScreenDir`, the function the screen
 * loader asks for a node's directory - an icon that says SCREENS is nothing
 * until the resolver reads it.
 *
 * `src/index.ts` is stubbed for the reason fm-is-wired-at-boot.test.ts gives:
 * requiring it binds the server's ports inside the jest worker. Everything
 * from `initializeData` downward is the production article.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const OLD_TITLE = Buffer.from([0x1b, 0x5b, 0x35, 0x3b, 0x33, 0x33, 0x6d, 0x7c, 0x0a]);
const NEW_TITLE = Buffer.from([0x1b, 0x5b, 0x33, 0x33, 0x3b, 0x31, 0x30, 0x30, 0x6d, 0x7c, 0x0a]);

/** A board the entrypoint seeded before the collapse existed, then deployed. */
function board(opts: { seededByEntrypoint: boolean }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collapse-boot-board-'));
  if (opts.seededByEntrypoint) fs.writeFileSync(path.join(dir, '.initialized'), 'seeded\n');
  for (const n of [1, 2, 3]) {
    fs.mkdirSync(path.join(dir, `Node${n}`), { recursive: true });
    fs.writeFileSync(path.join(dir, `Node${n}`, 'BBSTITLE.txt'), OLD_TITLE);
    fs.copyFileSync(path.join(REPO, 'board', 'Node2.info'), path.join(dir, `Node${n}.info`));
  }
  fs.mkdirSync(path.join(dir, 'Screens', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Screens', 'Node', 'BBSTITLE.txt'), NEW_TITLE);
  return dir;
}

async function boot(bbsRoot: string): Promise<{ resolveNodeScreenDir: (base: string, node: number) => string }> {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collapse-boot-db-'));
  tempDirs.push(dbDir);
  process.env.BBS_DATA_DIR = bbsRoot;
  process.env.BBS_ROOT = bbsRoot;
  process.env.DATABASE_DIR = dbDir;
  process.env.DATABASE_FILE = 'collapse-boot.db';
  jest.resetModules();
  jest.doMock('../../src/index', () => {
    const states = require('../../src/constants/bbs-states');
    return {
      BBSState: states.BBSState,
      LoggedOnSubState: states.LoggedOnSubState,
      LOCALHOST_IPS: ['127.0.0.1', '::1'],
    };
  });
  const { initializeData } = require('../../src/server/initialization');
  await initializeData();
  return require('../../src/screens/screen-resolution');
}

const tempDirs: string[] = [];
let savedEnv: Record<string, string | undefined>;

beforeAll(() => {
  savedEnv = {
    BBS_DATA_DIR: process.env.BBS_DATA_DIR,
    BBS_ROOT: process.env.BBS_ROOT,
    DATABASE_DIR: process.env.DATABASE_DIR,
    DATABASE_FILE: process.env.DATABASE_FILE,
  };
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('boot collapses a deployed board\'s node screens', () => {
  it('after boot every node reads Screens/Node, and the deployed copy is the one there', async () => {
    const root = board({ seededByEntrypoint: true });
    tempDirs.push(root);
    const { resolveNodeScreenDir } = await boot(root);

    for (const n of [1, 2, 3]) {
      expect({ n, dir: path.resolve(resolveNodeScreenDir(root, n)) })
        .toEqual({ n, dir: path.resolve(root, 'Screens', 'Node') });
    }
    expect(fs.readFileSync(path.join(root, 'Screens', 'Node', 'BBSTITLE.txt')).equals(NEW_TITLE)).toBe(true);
    expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.txt'))).toBe(false);
  }, 60_000);

  it('a checkout the entrypoint never seeded is left exactly as it is', async () => {
    const root = board({ seededByEntrypoint: false });
    tempDirs.push(root);
    const iconBefore = fs.readFileSync(path.join(root, 'Node1.info'));
    const { resolveNodeScreenDir } = await boot(root);

    expect(path.resolve(resolveNodeScreenDir(root, 1))).toBe(path.resolve(root, 'Node1'));
    expect(fs.readFileSync(path.join(root, 'Node1', 'BBSTITLE.txt')).equals(OLD_TITLE)).toBe(true);
    expect(fs.readFileSync(path.join(root, 'Node1.info')).equals(iconBefore)).toBe(true);
  }, 60_000);
});
