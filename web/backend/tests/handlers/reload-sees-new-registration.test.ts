/**
 * A registration written after startup has to be visible without a restart.
 *
 * The admin's door routes reloaded with `initializeDoors()`, which only READS
 * `commandCache` - the map `loadCommands` fills from disk. Reloading the doors
 * without reloading the commands re-reads the same stale map, so a door added
 * through the admin never appeared in the list it was added from, and an
 * edited one read back with the tooltypes it had at startup. Measured before
 * the fix: 150 doors, POST 200, 150 doors.
 *
 * `reloadDoorCommands` is the one that clears the cache and rescans, and it
 * already existed - the rescan endpoint uses it.
 */

process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { commandCache, loadCommands, reloadDoorCommands } from '../../src/handlers/command-execution.handler';

const REGISTRATION = [
  'LOCATION=Doors/auditreal/auditreal',
  'TYPE=AIM',
  'NAME=AUDITREAL',
  'ACCESS=10',
  'MULTINODE=YES',
  '',
].join('\n');

describe('a door registration written after startup', () => {
  let bbsRoot: string;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reload-scan-'));
    fs.mkdirSync(path.join(bbsRoot, 'Commands', 'BBSCmd'), { recursive: true });
    fs.mkdirSync(path.join(bbsRoot, 'Doors', 'auditreal'), { recursive: true });
    fs.writeFileSync(path.join(bbsRoot, 'Doors', 'auditreal', 'auditreal'), 'binary');
    // One door on the board at startup, so the cache is not empty.
    fs.writeFileSync(path.join(bbsRoot, 'Commands', 'BBSCmd', 'EXISTING.info'),
      'LOCATION=Doors/auditreal/auditreal\nTYPE=AIM\nNAME=EXISTING\nACCESS=10\n');
    commandCache.bbscmd.clear();
    loadCommands(bbsRoot, undefined, 0);
  });

  afterEach(() => {
    commandCache.bbscmd.clear();
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('is not in the cache until something rescans', () => {
    expect(commandCache.bbscmd.has('EXISTING')).toBe(true);

    fs.writeFileSync(path.join(bbsRoot, 'Commands', 'BBSCmd', 'AUDITREAL.info'), REGISTRATION);

    // Nothing has rescanned: the map is what it was.
    expect(commandCache.bbscmd.has('AUDITREAL')).toBe(false);
  });

  it('is in the cache after reloadDoorCommands', async () => {
    fs.writeFileSync(path.join(bbsRoot, 'Commands', 'BBSCmd', 'AUDITREAL.info'), REGISTRATION);

    await reloadDoorCommands(bbsRoot, undefined, 0);

    expect(commandCache.bbscmd.has('AUDITREAL')).toBe(true);
    expect(commandCache.bbscmd.get('AUDITREAL')?.location).toContain('auditreal');
  });
});
