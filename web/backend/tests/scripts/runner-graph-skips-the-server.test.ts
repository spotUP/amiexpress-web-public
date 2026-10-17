/**
 * Regression (2026-10-17, live Screens/quicknew.txt): the logoff batch runs
 * QuickNew through run-amiga-door.ts and writes the child's stdout to
 * Screens/quicknew.txt. Two defects put the server's boot log into that file,
 * which every caller then read at login:
 *
 *  1. The runner's module graph loaded src/index.ts (the server entry, which
 *     boots the database and initializeData at module load) through
 *     AmigaDoorSession -> LibraryManager -> XIMProtocol -> xim/userfield ->
 *     door.handler -> server/socket-handlers -> command.handler ->
 *     sysop-commands.handler, which imported the VALUE enum LoggedOnSubState
 *     from '../../index'. Fixed by importing it from constants/bbs-states.
 *  2. The runner's fd 1 is the door's Output() channel, but any module's
 *     process.stdout.write went to it too. Fixed in console-to-stderr.ts: the
 *     door writes through writeDoorOutput, every other stdout write goes to
 *     stderr (the parent logs it as `[runner:<door>]`).
 *
 * Driven through the REAL script entry in a child process, with a preload
 * hook (fixtures/runner-graph-hook.cjs) that watches the module graph and
 * writes one stray boot line plus one door string once AmigaDoorSession loads.
 * No door path is passed, so the runner prints its usage and exits after the
 * whole import graph has loaded. No emulator runs.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const BACKEND = path.resolve(__dirname, '..', '..');
const RUNNER = path.join(BACKEND, 'src', 'scripts', 'run-amiga-door.ts');
const HOOK = path.join(__dirname, 'fixtures', 'runner-graph-hook.cjs');

describe('run-amiga-door child process', () => {
  let stdout = '';
  let stderr = '';

  beforeAll(() => {
    const run = spawnSync(process.execPath, ['--require', 'tsx/cjs', '--require', HOOK, RUNNER], {
      cwd: BACKEND,
      encoding: 'utf8',
      timeout: 170_000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    stdout = run.stdout ?? '';
    stderr = run.stderr ?? '';
  }, 180_000);

  it('loads the door session (sentinel: the graph under test really ran)', () => {
    expect(stderr).toContain('RUNNER-GRAPH:door-session');
  });

  it('never loads the server entry src/index.ts', () => {
    expect(stderr).not.toContain('RUNNER-GRAPH:server-entry');
  });

  it('keeps fd 1 for the door: a stray process.stdout.write goes to the log', () => {
    expect(stdout).toBe('DOOR-OUTPUT-BYTES\n');
    expect(stderr).toContain('[FileAreas] STRAY BOOT LINE');
  });
});
