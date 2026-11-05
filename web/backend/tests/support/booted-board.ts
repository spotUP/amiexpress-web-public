/**
 * A REAL board, booted into a temp directory, for tests that need one.
 *
 * WHY THIS EXISTS. The transport walk (TP-16 R14, and TP-14 steps 02-16) has
 * been blocked on exactly one thing, measured rather than assumed: with a stub
 * `handleCommand`, step 02 returns ZERO bytes. Everything past the graphics
 * prompt goes through the real command handler, and the real command handler
 * needs a board behind it - conferences, screens, commands, a database.
 *
 * `tests/server/node-screens-collapse-at-boot.test.ts` proved the shape works
 * (temp root + temp DB + `jest.doMock('../../src/index')` + the real
 * `initializeData`). This packages it so the next test does not re-derive it.
 *
 * WHAT IT COPIES, and why so little: the smallest board that answers. Screens
 * and Conf1 because a caller is shown something and joins somewhere;
 * bbsConfig.info and the node icons because the board reads its own settings
 * from disk (`feedback_amiexpress_reads_disk_not_db` - user/access truth lives
 * in the .info files, SQL is a mirror). Doors are NOT copied: 138 door
 * registrations make the boot minutes long and no walk step needs one.
 *
 * WHAT IT NEVER TOUCHES: the live board. Everything is under the run's own
 * temp dir, which `tests/temp-run-dir.ts` sweeps - on 2026-09-06 stray test
 * boards put 12 GB in TMPDIR and three sessions spent an hour chasing ENOSPC
 * as if it were a test failure.
 */
import * as fs from 'fs';
import * as path from 'path';
import { testTmpDir } from '../temp-run-dir';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

export interface BootedBoard {
  root: string;
  cleanup: () => void;
}

/** Copy a directory if it is there; a board without it still boots. */
function copyIfPresent(from: string, to: string): void {
  try {
    if (!fs.existsSync(from)) return;
    fs.cpSync(from, to, { recursive: true });
  } catch {
    /* an unreadable source is not worth failing a boot over */
  }
}

/**
 * Lay out a temp board from the repository's own content.
 *
 * Deliberately NOT a synthetic board: the walk compares real screens byte for
 * byte, and a board of invented files would prove the walk agrees with the
 * fixture rather than with what a caller sees.
 */
export function makeBoardRoot(prefix = 'walk-board-'): string {
  const root = fs.mkdtempSync(path.join(testTmpDir(), prefix));

  copyIfPresent(path.join(REPO, 'board', 'Screens'), path.join(root, 'Screens'));
  copyIfPresent(path.join(REPO, 'board', 'Conf1'), path.join(root, 'Conf1'));
  copyIfPresent(path.join(REPO, 'board', 'Commands'), path.join(root, 'Commands'));

  for (const f of ['bbsConfig.info', 'ConfConfig.info']) {
    const src = path.join(REPO, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, f));
  }

  // A handful of nodes, each with the icon the board reads its settings from.
  for (const n of [0, 1, 2, 3]) {
    fs.mkdirSync(path.join(root, `Node${n}`), { recursive: true });
    const icon = path.join(REPO, `Node${n}.info`);
    const fallback = path.join(REPO, 'board', 'Node2.info');
    const from = fs.existsSync(icon) ? icon : fallback;
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(root, `Node${n}.info`));
  }

  // The entrypoint's marker: without it the boot re-runs one-time seeding.
  fs.writeFileSync(path.join(root, '.initialized'), 'test\n');
  return root;
}

/**
 * Boot the board. Returns once `initializeData` has run to completion.
 *
 * The caller MUST `jest.resetModules()` afterwards if it wants a clean graph -
 * this deliberately leaves the booted modules in place, because that is the
 * point: the test that follows drives the same instances the boot wired.
 */
export async function bootBoard(prefix?: string): Promise<BootedBoard> {
  const root = makeBoardRoot(prefix);
  const dbDir = fs.mkdtempSync(path.join(testTmpDir(), 'walk-db-'));

  const saved = {
    BBS_DATA_DIR: process.env.BBS_DATA_DIR,
    BBS_ROOT: process.env.BBS_ROOT,
    DATABASE_DIR: process.env.DATABASE_DIR,
    DATABASE_FILE: process.env.DATABASE_FILE,
  };
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
  process.env.DATABASE_DIR = dbDir;
  process.env.DATABASE_FILE = `walk-${path.basename(root)}.db`;

  jest.resetModules();
  // index.ts starts servers on import; the boot only needs its constants.
  jest.doMock('../../src/index', () => {
    const states = require('../../src/constants/bbs-states');
    return {
      BBSState: states.BBSState,
      LoggedOnSubState: states.LoggedOnSubState,
      LOCALHOST_IPS: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
    };
  });

  const { initializeData } = require('../../src/server/initialization');
  await initializeData();

  return {
    root,
    cleanup: () => {
      /*
       * The boot starts a BBSCmd directory watcher, and it outlives the test:
       * its timer fires after jest has torn the environment down and throws
       * "You are trying to `import` a file after the Jest environment has been
       * torn down", which surfaces against whatever runs next rather than here.
       */
      try {
        const { stopBbsCmdWatcher } = require('../../src/handlers/bbscmd-watcher');
        stopBbsCmdWatcher();
      } catch { /* not started, or already stopped */ }

      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* swept anyway */ }
      try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch { /* swept anyway */ }
    },
  };
}
