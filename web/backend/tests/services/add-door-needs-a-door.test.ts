/**
 * Add Door refuses to register a door that is not there.
 *
 * Nothing checked the path, so a typo - or a path typed before the files were
 * copied - wrote a registration pointing at nothing. The command scan drops
 * such a registration (commandLocationIsLive), so the command exists on disk,
 * never appears in the door list, and answers this when a user types it:
 *
 *   AmiExpress Web BBS [0:General] Menu: ae
 *   Door not found: /app/data/bbs/Doors/mail-composer
 *
 * Found on the live board on 2026-09-01: ae.info on the volume, not in the
 * image, pointing at a Doors/mail-composer that exists nowhere.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function service(bbsRoot: string) {
  const previous = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = bbsRoot;
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { DoorConfigService } = require('../../src/services/config-services/door-config.service');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const database: any = {
    getConfigRepository: () => ({
      createDoor: (d: unknown) => ({ id: 1, ...(d as object) }),
      getDoorByCommand: () => null,
      getAllDoors: () => [],
      logConfigChange: () => undefined,
    }),
  };
  const svc = new DoorConfigService(database);
  if (previous === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = previous;
  return svc;
}

describe('Add Door', () => {
  let bbsRoot: string;
  let previousDataDir: string | undefined;

  const door = (overrides: Record<string, unknown> = {}) => ({
    door_name: 'Mail Composer',
    door_command: 'AE',
    door_type: 'typescript',
    door_path: 'Doors/mail-composer',
    min_security_level: 10,
    ...overrides,
  });

  beforeEach(() => {
    previousDataDir = process.env.BBS_DATA_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-adddoor-'));
    fs.mkdirSync(path.join(bbsRoot, 'Commands', 'BBSCmd'), { recursive: true });
    fs.mkdirSync(path.join(bbsRoot, 'Doors'), { recursive: true });
    process.env.BBS_DATA_DIR = bbsRoot;
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousDataDir;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('refuses a path with nothing behind it, and names it', async () => {
    const svc = service(bbsRoot);

    await expect(svc.createDoor(door(), { username: 'sysop' } as any))
      .rejects.toThrow(/no door at 'Doors\/mail-composer'/);

    // And writes no registration, which is the state that produced the report.
    expect(fs.existsSync(path.join(bbsRoot, 'Commands', 'BBSCmd', 'AE.info'))).toBe(false);
  });

  it('accepts a door whose files are on the board', async () => {
    fs.mkdirSync(path.join(bbsRoot, 'Doors', 'mail-composer'));
    fs.writeFileSync(path.join(bbsRoot, 'Doors', 'mail-composer', 'package.json'), '{}');
    const svc = service(bbsRoot);

    await expect(svc.createDoor(door(), { username: 'sysop' } as any)).resolves.toBeDefined();
    expect(fs.existsSync(path.join(bbsRoot, 'Commands', 'BBSCmd', 'AE.info'))).toBe(true);
  });
});
