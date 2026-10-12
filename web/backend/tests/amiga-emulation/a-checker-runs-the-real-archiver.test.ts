/**
 * mULTI-cHECK - the board's LHA/LZX/ZIP upload checker - tests an archive by
 * running the archiver itself:
 *
 *     SystemTagList("\"C:LHA\" >NIL: -F t \"<file>\"")
 *
 * and reading LhA's return code. dos.library could not run a program, so the
 * call reached a TypeScript stand-in that only knew `x|e`, failed, and every
 * archive - good or bad - was reported "Archive Corrupt!".
 *
 * Driven through the real runner (scripts/run-amiga-door.ts, what the batch
 * scheduler spawns) with the real 68K mULTI-cHECK and the board's own C/LhA:
 * SystemTagList LoadSegs C:LHA (C: = the board's C/ first), runs it as a
 * child on its own stack, and hands its return code back. The sentinel that
 * the child really ran is dos.library's own record of LhA returning, with
 * the code it returned.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.resolve(__dirname, '..', '..');
const HARNESS = path.join(BACKEND, 'src', 'scripts', 'run-amiga-door.ts');
const TSX = path.join(BACKEND, 'node_modules', '.bin', 'tsx');
const CHECKER = path.join(__dirname, '..', 'fixtures', 'multi-check', 'mULTI-cHECK');
const ARCHIVE = path.join(__dirname, '..', 'fixtures', 'archives', 'checked.lha');
const LHA = path.join(REPO_ROOT, 'C', 'LhA');

const runnable = [HARNESS, TSX, CHECKER, ARCHIVE, LHA].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

/** The jest board (tests/live-data-guard.ts seeds a temp copy); never the checkout. */
function board(): string {
  const root = process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
  if (!root || path.resolve(root) === REPO_ROOT) throw new Error('run under dev-scripts/jest.config.ts (temp board)');
  return path.resolve(root);
}

const runs = new Map<string, { stdout: string; stderr: string }>();

/** One runner run per file; the tests below read the same run. */
function check(file: string): { stdout: string; stderr: string } {
  const done = runs.get(file);
  if (done) return done;
  const result = spawnSync(
    TSX,
    [
      HARNESS,
      path.join(board(), 'Doors-check', 'mULTI-cHECK'),
      '1',
      'BBS-PATH=BBS:',
      'PACKER=C:LHA',
      'TYPE=LHA',
      `BBS:Node1/Playpen/${file}`,
      '--doortype',
      'SIM',
      '--timeout',
      '120',
    ],
    {
      cwd: BACKEND,
      input: '',
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', BBS_DATA_DIR: board(), RAM_DIR: path.join(board(), 'ram') },
      timeout: 180_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  // eslint-disable-next-line no-control-regex
  const run = { stdout: (result.stdout || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''), stderr: result.stderr || '' };
  runs.set(file, run);
  return run;
}

describeMaybe('a checker runs the real archiver through SystemTagList', () => {
  beforeAll(() => {
    const root = board();
    fs.mkdirSync(path.join(root, 'C'), { recursive: true });
    fs.copyFileSync(LHA, path.join(root, 'C', 'LhA'));
    fs.mkdirSync(path.join(root, 'Doors-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(root, 'Doors-check', 'mULTI-cHECK'));
    const playpen = path.join(root, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(playpen, 'good.lha'));
    // Same archive, compressed data damaged: LhA's CRC check fails.
    const bad = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) bad[i] ^= 0x5a;
    fs.writeFileSync(path.join(playpen, 'bad.lha'), bad);
  });

  it('passes a good archive: C:LHA runs and returns 0', () => {
    const { stdout, stderr } = check('good.lha');
    expect(stderr).toMatch(/\[dos\.library\] "C:LHA" returned 0;/);
    expect(stdout).toMatch(/pASSED !/);
    expect(stdout).not.toMatch(/Archive Corrupt!/);
  }, 200_000);

  it('LhA returns to the directory it started in: pr_CurrentDir is a lock dos.library knows', () => {
    const { stderr } = check('good.lha');
    expect(stderr).toMatch(/\[dos\.library\] "C:LHA" returned 0;/);
    expect(stderr).not.toMatch(/CurrentDir: Invalid lock/);
    expect(stderr).not.toMatch(/is not a lock dos\.library handed out/);
  }, 200_000);

  it('rejects a damaged archive: C:LHA runs and returns 10', () => {
    const { stdout, stderr } = check('bad.lha');
    expect(stderr).toMatch(/\[dos\.library\] "C:LHA" returned 10;/);
    expect(stdout).toMatch(/Archive Corrupt!/);
    expect(stdout).not.toMatch(/pASSED !/);
  }, 200_000);
});
