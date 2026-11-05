/**
 * A 68K upload checker run by the board's headless launcher never waits on the
 * ESM loader.
 *
 * Live 2026-10-12 (Node 20.20.2, tsx 4.20.6): every program the backend ran
 * through utils/amiga-program-runner (mULTI-cHECK on an FTP upload,
 * ByteKillHandler and QuickNew at logoff) stopped right after
 * "[MULTICOM] INIT" until the 120 s / 300 s kill, and the killed checker passed
 * a damaged archive. AmigaDoorSession loaded the node table with
 * `await import("../nodes/MulticomManager.js")`. Under Node 20 that is a
 * request to tsx's off-thread hooks worker; a CPU profile of the runner showed
 * both threads idle for 27 s with the main thread parked in the import, and the
 * reply arrived only when something else woke the event loop (a SIGUSR2 for a
 * diagnostic report released one). It also loaded a second MulticomManager
 * (two "__multicom_canonical__" inits in one runner). Node 22/24 answer the
 * same import on the main thread, which is why the check took 10 s locally.
 *
 * Node 20 is not on this machine, so the test proves the mechanism instead of
 * the stall: a hook registered with NODE_OPTIONS records every resolve the ESM
 * loader is asked for, and a real checker run through the real launcher must
 * ask it for no backend module.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runAmigaProgram } from '../src/utils/amiga-program-runner.util';
import { config } from '../src/config';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECKER = path.join(REPO_ROOT, 'board', 'Doors', 'multi-check', 'mULTI-cHECK');
const LHA = path.join(REPO_ROOT, 'board', 'C', 'LhA');
const ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.lha');
const HOOK = path.join(__dirname, 'fixtures', 'esm-resolve-log', 'register.mjs');
const BACKEND_SRC = path.join(REPO_ROOT, 'web', 'backend', 'src');
const runnable = [CHECKER, LHA, ARCHIVE].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

describeMaybe('a 68K checker run makes no ESM-loader round trip', () => {
  let board: string;
  let restoreConfig: () => void;
  const saved = { NODE_OPTIONS: process.env.NODE_OPTIONS, ESM_RESOLVE_LOG: process.env.ESM_RESOLVE_LOG, RAM_DIR: process.env.RAM_DIR };

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-esm-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    fs.mkdirSync(path.join(board, 'C'));
    fs.copyFileSync(LHA, path.join(board, 'C', 'LhA'));
    fs.mkdirSync(path.join(board, 'Doors', 'multi-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(board, 'Doors', 'multi-check', 'mULTI-cHECK'));
    fs.mkdirSync(path.join(board, 'Node1', 'Playpen'), { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(board, 'Node1', 'Playpen', 'GOOD.LHA'));
    process.env.RAM_DIR = path.join(board, 'ram');
    process.env.ESM_RESOLVE_LOG = path.join(board, 'esm-resolves.log');
    process.env.NODE_OPTIONS = [saved.NODE_OPTIONS, `--import ${HOOK}`].filter(Boolean).join(' ');
  });

  afterEach(() => {
    restoreConfig();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(board, { recursive: true, force: true });
  });

  test('the checker finishes and the runner imported no backend module through the ESM loader', async () => {
    const result = await runAmigaProgram(path.join(board, 'Doors', 'multi-check', 'mULTI-cHECK'), {
      nodeId: 1,
      args: ['BBS-PATH=BBS:', 'PACKER=C:LHA', 'TYPE=LHA', '"BBS:Node1/Playpen/GOOD.LHA"'],
      doorType: 'SIM',
      timeoutMs: 120_000,
    });

    expect(result.killed).toBe(false);
    expect(result.output).toMatch(/pASSED !/);
    // The hook ran (the runner script itself is resolved through it) ...
    const resolves = fs.readFileSync(process.env.ESM_RESOLVE_LOG!, 'utf8').split('\n').filter(Boolean);
    expect(resolves.length).toBeGreaterThan(0);
    // ... and no backend module asked it for anything: no `import()` on the door path.
    const fromBackend = resolves.filter((line) => line.split('\t')[1]?.startsWith(`file://${BACKEND_SRC}/`));
    expect(fromBackend).toEqual([]);
  }, 240_000);
});
