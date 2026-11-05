/**
 * A door starts in AmiExpress's own current directory, BBS:.
 *
 * ACP CurrentDir()s into its own directory (ACP.e:3993-4014) and starts each
 * node with SystemTagList and no NP_CurrentDir (ACP.e:3946, 3234); express.e
 * starts every door and checker the same way (express.e:3322-3323 via runDoor
 * :4336, checkers :18584-18586). So a bare name a door is handed - or opens -
 * is BBS:'s, and a door that wants its own directory asks for PROGDIR:.
 * The emulator started doors in PROGDIR: instead.
 *
 * Driven through the real runner with the board's own C/LhA, given an upload
 * by a BBS-relative name; a damaged file of the same name sits under the
 * program's directory, which is what a door started in PROGDIR: would test.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.resolve(__dirname, '..', '..');
const HARNESS = path.join(BACKEND, 'src', 'scripts', 'run-amiga-door.ts');
const TSX = path.join(BACKEND, 'node_modules', '.bin', 'tsx');
const ARCHIVE = path.join(__dirname, '..', 'fixtures', 'archives', 'checked.lha');
const LHA = path.join(REPO_ROOT, 'board', 'C', 'LhA');

const runnable = [HARNESS, TSX, ARCHIVE, LHA].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

/** The jest board (tests/live-data-guard.ts seeds a temp copy); never the checkout. */
function board(): string {
  const root = process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
  if (!root || path.resolve(root) === REPO_ROOT) throw new Error('run under dev-scripts/jest.config.ts (temp board)');
  return path.resolve(root);
}

describeMaybe('a door starts in the BBS directory', () => {
  it('LhA handed "Node1/Playpen/<upload>" finds it: the current directory is BBS:, not the program directory', () => {
    const root = board();
    fs.mkdirSync(path.join(root, 'Doors-cwd'), { recursive: true });
    fs.copyFileSync(LHA, path.join(root, 'Doors-cwd', 'LhA'));
    fs.mkdirSync(path.join(root, 'Node1', 'Playpen'), { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(root, 'Node1', 'Playpen', 'cwd.lha'));
    // The same name under the program's directory, damaged: a door that
    // started in PROGDIR: would test this one and fail.
    const decoy = path.join(root, 'Doors-cwd', 'Node1', 'Playpen');
    fs.mkdirSync(decoy, { recursive: true });
    const bad = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) bad[i] ^= 0x5a;
    fs.writeFileSync(path.join(decoy, 'cwd.lha'), bad);

    const result = spawnSync(
      TSX,
      [HARNESS, path.join(root, 'Doors-cwd', 'LhA'), '1', 't', 'Node1/Playpen/cwd.lha', '--doortype', 'SIM', '--timeout', '120'],
      {
        cwd: BACKEND,
        input: '',
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0', BBS_DATA_DIR: root, RAM_DIR: path.join(root, 'ram') },
        timeout: 180_000,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    // eslint-disable-next-line no-control-regex
    const stdout = (result.stdout || '').replace(/\x1b\[[0-9;]*[A-Za-z ]/g, '');
    expect(stdout).toMatch(/all files OK/);
    expect(stdout).toMatch(/Operation successful/);
  }, 200_000);
});
