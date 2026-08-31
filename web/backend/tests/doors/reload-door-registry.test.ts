/**
 * Regression: a deleted door has to leave the list it is listed in.
 *
 * There are three caches between a .info on disk and the door list a sysop
 * sees, and the delete path refreshed the wrong ones:
 *
 *   commandCache.bbscmd  - parsed command definitions, reloaded from disk
 *   amigaDoorManager     - its own scan, used by the installer
 *   doors (door.handler) - the registry every list renders, built FROM
 *                          commandCache by initializeDoors()
 *
 * It called refreshDoorCache() (the manager's scan, which initializeDoors
 * does not read) and initializeDoors() — with nothing invalidating
 * commandCache. So the registry was faithfully rebuilt from stale
 * definitions, both steps logged OK, and the door stayed listed.
 *
 * Live board, 2026-08-31: DOORMAN removed Commands/BBSCmd/SEC.info, logged
 * "rescanning the door definitions" and "reloading the door registry" as
 * OK, then reported "SEC is still registered - the BBS still lists it".
 * The delete had worked. Only the verification was reading a stale list.
 *
 * The order matters as much as the set: commandCache must reload BEFORE
 * initializeDoors, because that is what initializeDoors reads.
 */

const calls: string[] = [];

const invalidateBbsCommandFreshness = jest.fn(() => { calls.push('invalidate'); });
const revalidateBbsCommandsIfChanged = jest.fn(() => { calls.push('revalidate'); return true; });
const refreshDoorCache = jest.fn(async () => { calls.push('refreshDoorCache'); });
const initializeDoors = jest.fn(async () => { calls.push('initializeDoors'); });

jest.mock('../../src/handlers/command-execution.handler', () => ({
  invalidateBbsCommandFreshness: (...a: []) => invalidateBbsCommandFreshness(...a),
  revalidateBbsCommandsIfChanged: (...a: []) => revalidateBbsCommandsIfChanged(...a),
  commandCache: { bbscmd: new Map(), syscmd: new Map() },
}));

jest.mock('../../src/handlers/door.handler', () => ({
  initializeDoors: (...a: []) => initializeDoors(...a),
}));

jest.mock('../../src/doors/amigaDoorManager', () => ({
  refreshDoorCache: (...a: []) => refreshDoorCache(...a),
}));

jest.mock('../../src/config', () => ({
  config: { get: () => '/tmp/bbs' },
}));

import { reloadDoorRegistry } from '../../src/doors/reload-door-registry';

beforeEach(() => {
  calls.length = 0;
  invalidateBbsCommandFreshness.mockClear();
  revalidateBbsCommandsIfChanged.mockClear();
  refreshDoorCache.mockClear();
  initializeDoors.mockClear();
});

it('invalidates the command definitions - the step that was missing', async () => {
  await reloadDoorRegistry();

  // Without this the stamp decides, and a deletion can look unchanged on a
  // filesystem with coarse timestamps. invalidateBbsCommandFreshness exists
  // for exactly that case and previously had no caller anywhere.
  expect(invalidateBbsCommandFreshness).toHaveBeenCalledTimes(1);
  expect(revalidateBbsCommandsIfChanged).toHaveBeenCalledTimes(1);
});

it('reloads the command definitions BEFORE rebuilding the registry', async () => {
  await reloadDoorRegistry();

  // initializeDoors reads commandCache. Rebuilding first would copy the
  // stale definitions into the registry - which is the whole bug.
  expect(calls.indexOf('revalidate')).toBeLessThan(calls.indexOf('initializeDoors'));
});

it('refreshes all three caches', async () => {
  await reloadDoorRegistry();

  expect(calls).toEqual([
    'invalidate',
    'revalidate',
    'refreshDoorCache',
    'initializeDoors',
  ]);
});

it('reports each stage, so a streaming delete log shows progress', async () => {
  const steps: string[] = [];

  await reloadDoorRegistry((s) => steps.push(`${s.kind}:${s.text}`));

  expect(steps).toHaveLength(3);
  expect(steps.every((s) => s.startsWith('ok:'))).toBe(true);
  expect(steps.join(' ')).toContain('command definitions');
  expect(steps.join(' ')).toContain('door registry');
});

it('carries on and reports false when one stage throws', async () => {
  // A failed reload must not abort the rest: the files are already gone,
  // and leaving two of three caches stale is worse than one.
  refreshDoorCache.mockRejectedValueOnce(new Error('scan blew up') as never);
  const steps: string[] = [];

  const ok = await reloadDoorRegistry((s) => steps.push(`${s.kind}:${s.text}`));

  expect(ok).toBe(false);
  expect(calls).toContain('initializeDoors');
  expect(steps.some((s) => s.startsWith('fail:'))).toBe(true);
});

it('still rebuilds the registry when the command reload throws', async () => {
  revalidateBbsCommandsIfChanged.mockImplementationOnce(() => {
    throw new Error('no baseDir');
  });

  const ok = await reloadDoorRegistry();

  expect(ok).toBe(false);
  expect(calls).toContain('initializeDoors');
});
