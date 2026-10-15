/**
 * Adding a door must write the registration, whatever the mirror says.
 *
 * `doors.door_type` is CHECKed against ('SYSCMD','BBSCMD','INTERNAL') - the
 * command's SCOPE - while the list the Add Door form is filled from reports
 * the door's TYPE, which is what the .info carries: XIM, AIM, FIM, DD, SIM,
 * typescript. createDoor inserted the mirror row FIRST, so every add with a
 * real type threw "CHECK constraint failed: door_type" before writing
 * anything: a 500 with a raw SQLite message, and no door.
 *
 * Commands/BBSCmd/<CMD>.info is what the BBS reads; the table is a copy. The
 * registration is written first now, and a mirror that refuses the row does
 * not take the door with it.
 */

process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoorConfigService } from '../../src/services/config-services/door-config.service';
import { config as appConfig } from '../../src/config';
import type { Database } from '../../src/database';

const context = { userId: 'u1', username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'jest' };

const NEW_DOOR = {
  door_name: 'AUDITDOOR',
  door_command: 'AUDITDOOR',
  description: 'a door the sysop just added',
  door_type: 'XIM',
  runtime_env: 'native',
  min_security_level: 10,
  time_limit: 30,
  enabled: true,
  door_path: 'Doors/auditdoor/auditdoor',
  door_args: '',
  working_directory: '',
  priority: 'P0',
  door_options: [],
} as any;

describe('creating a door', () => {
  let bbsRoot: string;
  let previousDataDir: string;
  let mirrorCalls: number;

  const serviceWithMirror = (behaviour: 'ok' | 'throws') => {
    const repo = {
      getDoors: () => [],
      getDoorByCommand: () => undefined,
      createDoor: (door: any) => {
        mirrorCalls++;
        if (behaviour === 'throws') {
          throw new Error("CHECK constraint failed: door_type IN ('SYSCMD', 'BBSCMD', 'INTERNAL')");
        }
        return { ...door, id: 1 };
      },
      logConfigChange: () => {},
    };
    return new DoorConfigService({ getConfigRepository: () => repo } as unknown as Database);
  };

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-create-'));
    fs.mkdirSync(path.join(bbsRoot, 'Commands', 'BBSCmd'), { recursive: true });
    // The door has to be on the board before it can be registered: a
    // registration pointing at nothing is a command that answers "Door not
    // found" (door-config.service.ts), which is the state AE was found in.
    fs.mkdirSync(path.join(bbsRoot, 'Doors', 'auditdoor'), { recursive: true });
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', bbsRoot);
    mirrorCalls = 0;
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  const registration = () => path.join(bbsRoot, 'Commands', 'BBSCmd', 'AUDITDOOR.info');

  it('writes the registration the BBS reads', async () => {
    await serviceWithMirror('ok').createDoor(NEW_DOOR, context);

    expect(fs.existsSync(registration())).toBe(true);
    const written = fs.readFileSync(registration()).toString('latin1');
    expect(written).toContain('LOCATION=Doors/auditdoor/auditdoor');
    expect(written).toContain('TYPE=XIM');
  });

  it('still writes it when the mirror refuses the row', async () => {
    await expect(serviceWithMirror('throws').createDoor(NEW_DOOR, context)).resolves.toBeDefined();

    expect(mirrorCalls).toBe(1);
    expect(fs.existsSync(registration())).toBe(true);
    expect(fs.readFileSync(registration()).toString('latin1')).toContain('TYPE=XIM');
  });
});
