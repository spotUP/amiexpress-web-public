/**
 * reloadDoors() refreshes the installed-68K cache before re-registering.
 *
 * A door's registration is folded from TWO sources: the BBSCMD
 * CommandDefinition and the installed 68K record (amigaDoorManager's cache).
 * initializeDoors() reads both and resolves MIN_COLUMNS / C64_ADAPT once onto
 * the Door the gate and the [40]/[C64] markers then read.
 *
 * reloadDoors() re-read only the first of those. The installed cache still
 * held the .info bytes scanned at boot, so a sysop editing an installed
 * door's tooltypes had to restart the board - which CONFIGURATION.md
 * explicitly promises is not necessary ("the new tooltype takes effect on the
 * next command without a restart"). Whole-run review, I6; ledger deferred
 * minor 1; handoff known limit 7.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));

const refreshCache = jest.fn().mockResolvedValue(undefined);
const scanInstalledDoors = jest.fn().mockResolvedValue([]);
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: '/nonexistent',
    refreshCache,
    scanInstalledDoors,
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { reloadDoors } from '../../src/handlers/door.handler';

// The real loadCommands runs, pointed at an empty temp BBS root: it finds no
// Commands/BBSCmd and registers nothing, which is all this suite needs.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';

let root: string;
const realConfigGet = config.get.bind(config);

beforeEach(() => {
  refreshCache.mockClear().mockResolvedValue(undefined);
  scanInstalledDoors.mockClear().mockResolvedValue([]);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reload-doors-'));
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
  const { commandCache } = require('../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('reloadDoors', () => {
  it('refreshes the installed-door cache, so an edited .info is seen without a restart', async () => {
    await reloadDoors();
    expect(refreshCache).toHaveBeenCalledTimes(1);
  });

  it('refreshes BEFORE re-registering, so initializeDoors folds the NEW records', async () => {
    const order: string[] = [];
    refreshCache.mockImplementation(async () => {
      order.push('refresh');
    });
    scanInstalledDoors.mockImplementation(async () => {
      order.push('scan');
      return [];
    });

    await reloadDoors();

    expect(order).toEqual(['refresh', 'scan']);
  });

  it('still re-registers when the cache refresh throws - a scan failure is not fatal', async () => {
    refreshCache.mockRejectedValueOnce(new Error('volume busy'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(reloadDoors()).resolves.toBeDefined();

    expect(scanInstalledDoors).toHaveBeenCalled();
    warn.mockRestore();
  });
});
