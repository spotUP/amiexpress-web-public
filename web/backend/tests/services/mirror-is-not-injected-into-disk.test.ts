/**
 * The database mirror must never be a SOURCE for a config file.
 *
 * `mergeForWrite` exists to stop a lagging mirror TRUNCATING disk. Four
 * writers handed it the entire mirror as the "changed" set, which let it
 * overwrite and append as well as protect:
 *
 *   const changed = change.entry ? [...fromDb, change.entry] : fromDb;
 *
 * So editing one protocol appended a LIBRARY.n for every row the table held,
 * editing one computer rewrote a name the sysop had never touched, and
 * editing one drive rewrote the other's path - from rows that disagree with
 * disk on the live board, which is the normal state there.
 *
 * Every test below seeds a deliberately divergent mirror and asserts the file
 * gained exactly the one change and nothing else.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { ComputerConfigService } from '../../src/services/config-services/computer-config.service';
import { ProtocolConfigService } from '../../src/services/config-services/protocol-config.service';
import { ScreenConfigService } from '../../src/services/config-services/screen-config.service';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { config as appConfig } from '../../src/config';

const CONTEXT = { userId: '1', username: 'sysop' } as never;

function seed(filePath: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(filePath, text);
}

function database(overrides: Record<string, unknown>) {
  const repo = { logConfigChange: () => undefined, ...overrides };
  return { getConfigRepository: () => repo } as never;
}

describe('a save writes the change, not the mirror', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('computers: a stale mirror row does not rewrite a name on disk', async () => {
    const file = path.join(root, 'ComputerList.info');
    seed(file, { 'COMPUTER.1': 'AMiGA 500', 'COMPUTER.2': 'PC', 'COMPUTER.NUM': '2' });

    // The live shape: the table's idea of the world disagrees with disk, both
    // in spelling and in what exists at all.
    const db = database({
      getAllComputerTypes: () => [
        { id: 1, computer_number: 1, computer_name: 'Amiga 500', enabled: true },
        { id: 9, computer_number: 9, computer_name: 'PHANTOM', enabled: true },
      ],
      getComputerTypeById: () => ({ id: 2, computer_number: 2, computer_name: 'PC', enabled: true }),
      updateComputerType: () => true,
    });

    await new ComputerConfigService(db).updateComputerType(
      2, { computer_name: 'Peecee' } as never, CONTEXT
    );

    const after = readTooltypeMap(file);
    expect(after.get('COMPUTER.1')).toBe('AMiGA 500');   // not 'Amiga 500'
    expect(after.get('COMPUTER.2')).toBe('Peecee');
    expect([...after.values()]).not.toContain('PHANTOM');
    expect(after.get('COMPUTER.NUM')).toBe('2');
  });

  it('protocols: mirror rows do not become LIBRARY entries of their own', async () => {
    const file = path.join(root, 'Protocols', 'XprTypes.info');
    seed(file, {
      'LIBRARY.1': 'INTERNAL', 'TITLE.1': '/X Zmodem',
      'LIBRARY.2': 'xprzmodem.library', 'TITLE.2': 'XPR Zmodem',
    });

    const db = database({
      getProtocols: () => [
        { id: 1, protocol_code: 'A', protocol_name: 'phantom A', command: 'a', enabled: true },
        { id: 2, protocol_code: 'Z', protocol_name: 'phantom Z', command: 'z', enabled: true },
      ],
      getProtocol: () => ({
        id: 2, protocol_code: 'xprzmodem.library', protocol_name: 'XPR Zmodem',
        command: 'z', enabled: true,
      }),
      updateProtocol: (_id: number, updates: Record<string, unknown>) => ({
        id: 2, protocol_code: 'xprzmodem.library', protocol_name: 'XPR Zmodem',
        command: 'z', enabled: true, ...updates,
      }),
    });

    await new ProtocolConfigService(db).updateProtocol(
      2, { protocol_name: 'Zmodem' } as never, CONTEXT
    );

    const after = readTooltypeMap(file);
    expect(after.get('LIBRARY.1')).toBe('INTERNAL');
    expect(after.get('LIBRARY.2')).toBe('xprzmodem.library');
    expect(after.get('TITLE.2')).toBe('Zmodem');
    // The phantoms: express would offer a protocol whose Amiga library is the
    // literal string 'A'.
    expect(after.has('LIBRARY.3')).toBe(false);
    expect([...after.values()]).not.toContain('A');
  });

  it('drives: editing one drive does not rewrite the other', async () => {
    const file = path.join(root, 'Drives.info');
    seed(file, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });

    const driveRow = { drive_path: 'DH2:Files' };
    const db = database({
      getAllDrives: () => [
        { id: 1, drive_number: 1, drive_path: 'WRONG:Path', enabled: true },
      ],
      // getDrive reads the mirror, so the row has to move when it is updated -
      // resolving a disk id against a database row is Phase 2.2, not this.
      getDriveById: () => ({ id: 2, drive_number: 2, drive_path: driveRow.drive_path, enabled: true }),
      updateDrive: (_id: number, updates: { drive_path?: string }) => {
        if (updates.drive_path) driveRow.drive_path = updates.drive_path;
        return true;
      },
    });

    await new DriveConfigService(db).updateDrive(
      2, { drive_path: 'DH2:Uploads' } as never, CONTEXT
    );

    const after = readTooltypeMap(file);
    expect(after.get('DRIVE.1')).toBe('DH1:Files');
    expect(after.get('DRIVE.2')).toBe('DH2:Uploads');
  });

  it('screen types: mirror rows do not appear in the file', async () => {
    const file = path.join(root, 'ScreenTypes.info');
    seed(file, {
      'TYPE.1': 'PAL', 'TITLE.1': 'PAL:High Res',
      'TYPE.2': 'NTSC', 'TITLE.2': 'NTSC:High Res',
    });

    const db = database({
      getAllScreenTypes: () => [
        { id: 1, screen_number: 1, screen_type: 'PHANTOM1', screen_title: 'nope', enabled: true },
        { id: 2, screen_number: 2, screen_type: 'PHANTOM2', screen_title: 'nope', enabled: true },
      ],
      getScreenTypeById: () => ({
        id: 1, screen_number: 1, screen_type: 'PAL', screen_title: 'PAL:High Res', enabled: true,
      }),
      updateScreenType: () => true,
    });

    await new ScreenConfigService(db).updateScreenType(
      1, { screen_title: 'PAL:Lo Res' } as never, CONTEXT
    );

    const after = readTooltypeMap(file);
    expect(after.get('TYPE.1')).toBe('PAL');
    expect(after.get('TITLE.1')).toBe('PAL:Lo Res');
    expect(after.get('TYPE.2')).toBe('NTSC');
    expect(after.has('TYPE.3')).toBe(false);
    expect([...after.values()]).not.toContain('PHANTOM1');
  });
});
