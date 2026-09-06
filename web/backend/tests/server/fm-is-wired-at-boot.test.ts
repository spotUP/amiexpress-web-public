/**
 * `FM` is only as good as its wiring, and its wiring was missing.
 *
 * `file-maintenance.handler.ts` keeps its `db`/`config` in module-level
 * `let`s filled by `setFileMaintenanceDependencies`. A second export of that
 * EXACT name lives in `file.handler.ts` (it injects the search/CRUD
 * functions), boot imported and called THAT one, and nothing ever called the
 * maintenance module's own. So `handleFileMaintenanceCommand`'s first
 * statement after the ACS check -
 *
 *     const bbsDataPath = _config.get('dataDir');
 *
 * - threw `Cannot read properties of undefined (reading 'get')` for every
 * sysop on every board, pooled or local, which made the pooled-delete and
 * resolved-delete-key fixes on this branch dead code in production.
 *
 * The trap this test exists to avoid: a test that calls
 * `setFileMaintenanceDependencies` itself and then drives FM proves only
 * that the handler works when someone injects into it - which is precisely
 * what was true while FM was broken. So nothing here injects anything. It
 * loads the FM module cold, shows it is unwired, runs the REAL boot routine
 * (`server/initialization.ts#initializeData`, the function index.ts's
 * start-up IIFE calls), and drives FM again through its top-level entry
 * point. Delete the `setFileMaintenanceDependencies({ db, config, callersLog })`
 * call from `initializeData` and this file goes red.
 *
 * The one thing stubbed is `src/index.ts` itself, and only because requiring
 * it runs the server's start-up IIFE - it binds HTTP, telnet and SSH ports
 * inside the jest worker (EADDRINUSE against a running dev server, and a
 * hung run afterwards). Three modules in the graph import runtime values
 * from it; the stub re-exports the real ones. Everything from
 * `initializeData` downward is the production article.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The suite's own database is not wanted here: `initializeData` builds the
// board's real singleton against DATABASE_DIR below.
process.env.SKIP_DB_INIT = '1';

const UNWIRED_CONFIG = /Cannot read properties of undefined \(reading 'get'\)/;

/** express.e:24911-24913 - the first thing FM prints once it can read dataDir. */
const PAST_THE_DEREF = 'No files available in this conference.';

interface ProbeResult {
  threw: string | null;
  out: string;
}

/**
 * The FM command as a sysop reaches it: the exported class method the three
 * dispatchers call, with EDIT_FILES (ACS index 47) granted.
 */
async function runFileMaintenance(fmModule: any): Promise<ProbeResult> {
  const out: string[] = [];
  const socket = {
    id: 'socket-fm-boot',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
  };
  const session: any = {
    user: { id: 1, username: 'sysop', securityFlags: 'T'.repeat(60) },
    currentConf: 1,
    nodeId: 1,
  };

  try {
    await fmModule.FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, '');
    return { threw: null, out: out.join('') };
  } catch (error: any) {
    return { threw: String(error?.message ?? error), out: out.join('') };
  }
}

describe('boot wires the FM command', () => {
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

  it('gets FM past _config.get(dataDir) - which nothing but boot can do', async () => {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-boot-board-'));
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-boot-db-'));
    tempDirs.push(board, dbDir);
    process.env.BBS_DATA_DIR = board;
    process.env.BBS_ROOT = board;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'fm-boot.db';

    jest.resetModules();
    jest.doMock('../../src/index', () => {
      const states = require('../../src/constants/bbs-states');
      return {
        BBSState: states.BBSState,
        LoggedOnSubState: states.LoggedOnSubState,
        LOCALHOST_IPS: ['127.0.0.1', '::1'],
      };
    });

    // Cold module, nothing injected: the production defect, reproduced.
    const fmModule = require('../../src/handlers/file/file-maintenance.handler');
    const beforeBoot = await runFileMaintenance(fmModule);
    expect(beforeBoot.threw).toMatch(UNWIRED_CONFIG);
    expect(beforeBoot.out).not.toContain(PAST_THE_DEREF);

    // The real boot routine. Nothing in this test injects an FM dependency;
    // if initializeData does not, the assertions below cannot pass.
    const { initializeData } = require('../../src/server/initialization');
    await initializeData();

    const afterBoot = await runFileMaintenance(fmModule);
    expect(afterBoot.threw).toBeNull();
    // Reaching this line is the proof: it is printed AFTER
    // `_config.get('dataDir')` and after the ACS check, so it cannot be
    // produced by an unwired module or by a permission-denied early return.
    expect(afterBoot.out).toContain(PAST_THE_DEREF);
  }, 120000);
});
