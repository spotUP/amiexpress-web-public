/**
 * Live bug: the sysop renamed or uninstalled a door in the web admin and the
 * OLD command kept running until a restart. The command handler matched doors
 * against a startup snapshot (the dependency-injection container) while the
 * admin's reload rebuilt door.handler's list. There is ONE door list now;
 * this drives the real path (reload -> handleCommand -> processCommand ->
 * executeDoor) and uses createAllDropFiles as the launch sentinel.
 *
 * The reload is initializeDoors() over commandCache.bbscmd - step 3 of
 * doors/reload-door-registry.ts reloadDoorRegistry, the step that rebuilds
 * the list every reader sees.
 */
import {
  installDispatchHarness, doorOver, register, makeSocket, ansiSession, doorDropFileManager,
} from './dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { initializeDoors } from '../../src/handlers/door.handler';

installDispatchHarness();

/** The admin's save: the old .info is gone, the renamed one is in place, the registry reloads. */
async function adminRenames(from: string, to: string) {
  const def = commandCache.bbscmd.get(from);
  commandCache.bbscmd.delete(from);
  commandCache.bbscmd.set(to, { ...def, name: to });
  await initializeDoors();
}

const typed = async (cmd: string) => {
  await handleCommand(makeSocket() as any, ansiSession(cmd), '');
  return (doorDropFileManager.createAllDropFiles as jest.Mock).mock.calls.length;
};

describe('a renamed door answers to its new command at once', () => {
  beforeEach(async () => {
    await register(doorOver('FOO', { TYPE: 'XIM' }));
  });

  it('runs FOO before the rename (the sentinel is live)', async () => {
    expect(await typed('FOO')).toBeGreaterThan(0);
  });

  it('stops running FOO after the admin renames it to BAR', async () => {
    await adminRenames('FOO', 'BAR');
    expect(await typed('FOO')).toBe(0);
  });

  it('runs BAR after the rename', async () => {
    await adminRenames('FOO', 'BAR');
    expect(await typed('BAR')).toBeGreaterThan(0);
  });

  it('stops running FOO after the admin uninstalls it', async () => {
    commandCache.bbscmd.delete('FOO');
    await initializeDoors();
    expect(await typed('FOO')).toBe(0);
  });
});
