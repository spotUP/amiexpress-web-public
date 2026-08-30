import * as path from 'path';
import {
  isSafeToDelete,
  resolveDoorInstallDir,
} from '../../../../Doors/door-manager/safe-install-dir';

/**
 * DOORMAN emptied the live board on 2026-08-30.
 *
 * Uninstalling a door ran `fs.rmSync(path.join(PROJECT_ROOT, install_dir),
 * { recursive: true, force: true })` with nothing checking what install_dir
 * held. It is written as `Doors/${command}`, so a record with no command
 * gives `Doors/` - and a recursive force-delete of that removes every door on
 * the board, DOORMAN with them. That is what the live volume showed
 * afterwards: /app/data/bbs/Doors gone entirely, while
 * Commands/BBSCmd still held 365 .info files.
 *
 * These pin the guard. Each case is a value that must never be turned into a
 * path a delete may touch.
 */

const ROOT = path.resolve('/srv/bbs');

function reasonFor(installDir: string | null | undefined): string {
  const decision = resolveDoorInstallDir(ROOT, installDir);
  if (isSafeToDelete(decision)) throw new Error(`expected ${String(installDir)} to be refused`);
  return decision.reason;
}

describe('DOORMAN uninstall path guard', () => {
  it('allows a real door directory', () => {
    const decision = resolveDoorInstallDir(ROOT, 'Doors/WALL');

    expect(isSafeToDelete(decision)).toBe(true);
    expect(isSafeToDelete(decision) && decision.path).toBe(path.join(ROOT, 'Doors', 'WALL'));
  });

  it('allows a door nested below Doors/', () => {
    const decision = resolveDoorInstallDir(ROOT, 'Doors/games/TETRIS');

    expect(isSafeToDelete(decision) && decision.path).toBe(path.join(ROOT, 'Doors', 'games', 'TETRIS'));
  });

  it('refuses the Doors directory itself - the value that emptied the board', () => {
    expect(reasonFor('Doors/')).toContain('Doors directory itself');
    expect(reasonFor('Doors')).toContain('Doors directory itself');
    expect(reasonFor('Doors/.')).toContain('Doors directory itself');
  });

  it('refuses a record with no install directory', () => {
    expect(reasonFor(null)).toContain('no install directory');
    expect(reasonFor(undefined)).toContain('no install directory');
    expect(reasonFor('')).toContain('no install directory');
    expect(reasonFor('   ')).toContain('no install directory');
  });

  it('refuses anything that climbs out of Doors/', () => {
    expect(reasonFor('Doors/..')).toBeTruthy();
    expect(reasonFor('Doors/../..')).toBeTruthy();
    expect(reasonFor('Doors/WALL/../..')).toBeTruthy();
    expect(reasonFor('..')).toBeTruthy();
    expect(reasonFor('.')).toBeTruthy();
  });

  it('refuses a sibling of Doors/, however it is spelled', () => {
    expect(reasonFor('Commands')).toContain('outside Doors/');
    expect(reasonFor('Commands/BBSCmd')).toContain('outside Doors/');
    // A prefix match is not containment: DoorsBackup is not inside Doors.
    expect(reasonFor('DoorsBackup/WALL')).toContain('outside Doors/');
  });

  it('refuses an absolute path', () => {
    expect(reasonFor('/')).toContain('absolute');
    expect(reasonFor('/srv/bbs/Doors/WALL')).toContain('absolute');
    expect(reasonFor('/etc')).toContain('absolute');
  });

  it('gives a reason a sysop can act on', () => {
    // The panel shows this instead of deleting, so it has to say something.
    for (const bad of ['Doors', '', '..', '/etc', 'Commands']) {
      expect(reasonFor(bad).length).toBeGreaterThan(10);
    }
  });
});
