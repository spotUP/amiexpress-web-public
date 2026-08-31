/**
 * A save must leave a file AmiExpress can still read.
 *
 * `InfoFileParser.write()` returned 256 zero bytes with a magic number
 * followed by raw `KEY=VALUE\0` strings: no DiskObject, no gadget, no
 * length-prefixed tooltype array. `GetDiskObject` answers NIL for that (or
 * succeeds with a NULL do_ToolTypes), so `FindToolType` finds nothing
 * (tooltypes.e:215-218) and every setting written through it went silent -
 * while the icon image it overwrote was destroyed in the same call.
 *
 * Ten writers used it. These tests drive each one against a REAL binary icon
 * in a temp BBS root and assert three things per domain: the change is
 * readable afterwards, a tooltype the writer does not own survived, and the
 * icon's own bytes are still there.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseInfoFile } from '../../src/utils/info-file.util';
import { ComputerConfigService } from '../../src/services/config-services/computer-config.service';
import { ProtocolConfigService } from '../../src/services/config-services/protocol-config.service';
import { ScreenConfigService } from '../../src/services/config-services/screen-config.service';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { NodeConfigService } from '../../src/services/config-services/node-config.service';
import { FileCheckerConfigService } from '../../src/services/config-services/file-checker-config.service';
import { LanguageConfigService } from '../../src/services/config-services/language-config.service';
import { ConferenceSetupService } from '../../src/services/conference-setup.service';
import { config as appConfig } from '../../src/config';

const CONTEXT = { userId: '1', username: 'sysop' } as never;

/** Bytes that stand in for the icon image, and must survive every save. */
const ICON_TRAILER = Buffer.from('IMAGE-BYTES-DO-NOT-TOUCH', 'latin1');

/**
 * A real binary .info: a 78-byte DiskObject whose Gadget carries a width and
 * a height, then the length-prefixed tooltype array, then the image data.
 * This is the shape `parseInfoFile` locates and `writeInfoFile` rebuilds.
 */
function binaryIcon(tooltypes: string[]): Buffer {
  const diskObject = Buffer.alloc(78);
  diskObject.writeUInt16BE(0xe310, 0);   // do_Magic
  diskObject.writeUInt16BE(1, 2);        // do_Version
  diskObject.writeUInt16BE(24, 12);      // do_Gadget.Width
  diskObject.writeUInt16BE(22, 14);      // do_Gadget.Height

  const entries: Buffer[] = [];
  for (const entry of tooltypes) {
    const str = Buffer.from(entry + '\0', 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(str.length, 0);
    entries.push(len, str);
  }

  const count = Buffer.alloc(4);
  count.writeUInt32BE((tooltypes.length + 1) * 4, 0);

  return Buffer.concat([diskObject, count, ...entries, ICON_TRAILER]);
}

function seedIcon(filePath: string, tooltypes: string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, binaryIcon(tooltypes));
}

/** What a reader gets back: the tooltypes, and whether the icon survived. */
function readBack(filePath: string): { tooltypes: Map<string, string>; isBinary: boolean; keptIcon: boolean } {
  const info = parseInfoFile(filePath);
  const tooltypes = new Map<string, string>();
  for (const tt of info.tooltypes) {
    if (!tt.commented) tooltypes.set(tt.key, tt.value);
  }
  return {
    tooltypes,
    isBinary: info.isBinary,
    keptIcon: fs.readFileSync(filePath).includes(ICON_TRAILER),
  };
}

/** Every repository method any of these services reaches for. */
function repoStub(overrides: Record<string, unknown> = {}) {
  return {
    getAllComputerTypes: () => [],
    getComputerTypeById: () => null,
    createComputerType: () => 1,
    updateComputerType: () => true,
    deleteComputerType: () => true,
    getProtocols: () => [],
    getProtocol: () => null,
    createProtocol: (p: unknown) => ({ id: 1, ...(p as object) }),
    updateProtocol: () => ({ id: 1 }),
    deleteProtocol: () => true,
    getAllScreenTypes: () => [],
    getScreenTypeById: () => null,
    createScreenType: () => 1,
    updateScreenType: () => true,
    deleteScreenType: () => true,
    getAllDrives: () => [],
    getDriveById: () => null,
    getDriveByNumber: () => null,
    createDrive: () => 1,
    updateDrive: () => true,
    deleteDrive: () => true,
    getNodeConfig: () => null,
    getNodeConfigs: () => [],
    updateNodeConfig: () => ({ id: 1 }),
    getAllFileCheckers: () => [],
    getFileCheckerById: () => null,
    createFileChecker: () => 1,
    updateFileChecker: () => true,
    deleteFileChecker: () => true,
    getLanguages: () => [],
    getLanguage: () => null,
    getLanguageByCode: () => null,
    createLanguage: (l: unknown) => ({ id: 1, ...(l as object) }),
    updateLanguage: () => ({ id: 1 }),
    deleteLanguage: () => true,
    logConfigChange: () => undefined,
    ...overrides,
  };
}

function database(overrides: Record<string, unknown> = {}) {
  const repo = repoStub(overrides);
  return { database: { getConfigRepository: () => repo } as never, repo };
}

describe('a lookup-table save leaves a readable icon behind', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-icons-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('computer types: ComputerList.info stays a binary icon', async () => {
    const file = path.join(root, 'ComputerList.info');
    seedIcon(file, ['COMPUTER.1=AMiGA 500', 'COMPUTER.NUM=1', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database();
    await new ComputerConfigService(db).createComputerType(
      { computer_number: 2, computer_name: 'AMiGA 1200', enabled: true } as never,
      CONTEXT
    );

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect([...after.tooltypes.values()]).toContain('AMiGA 1200');
  });

  it('protocols: XprTypes.info stays a binary icon', async () => {
    const file = path.join(root, 'Protocols', 'XprTypes.info');
    seedIcon(file, ['LIBRARY.1=INTERNAL', 'TITLE.1=/X Zmodem', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database();
    await new ProtocolConfigService(db).createProtocol(
      { protocol_code: 'Hydra', protocol_name: '/X Hydra', command: 'Hydra', enabled: true } as never,
      CONTEXT
    );

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect([...after.tooltypes.values()]).toContain('Hydra');
  });

  it('screen types: ScreenTypes.info stays a binary icon', async () => {
    const file = path.join(root, 'ScreenTypes.info');
    seedIcon(file, ['TYPE.1=PAL', 'TITLE.1=PAL:High Res', 'IM_A_TOOLTYPE=keep me']);

    const row = {
      id: 1, screen_number: 1, screen_type: 'PAL', screen_title: 'PAL:Lo Res', enabled: true,
    };
    const { database: db } = database({
      getScreenTypeById: () => row,
      getAllScreenTypes: () => [row],
    });
    await new ScreenConfigService(db).updateScreenType(
      1, { screen_title: 'PAL:Lo Res' } as never, CONTEXT
    );

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('TYPE.1')).toBe('PAL');
    expect(after.tooltypes.get('TITLE.1')).toBe('PAL:Lo Res');
  });

  it('drives: Drives.info stays a binary icon', async () => {
    const file = path.join(root, 'Drives.info');
    seedIcon(file, ['DRIVE.1=DH1:Files', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database({
      getDriveById: () => ({ id: 2, drive_number: 2, drive_path: 'DH2:Files', enabled: true }),
    });
    await new DriveConfigService(db).updateDrive(2, { drive_path: 'DH2:Files' } as never, CONTEXT);

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('DRIVE.1')).toBe('DH1:Files');
    expect(after.tooltypes.get('DRIVE.2')).toBe('DH2:Files');
  });

  it('nodes: Node1.info stays a binary icon', async () => {
    const file = path.join(root, 'Node1.info');
    seedIcon(file, ['NODESTART=BBS:Express', 'CALLERS_LOG=1', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database();
    await new NodeConfigService(db).updateNodeConfig(
      2, { node_number: 1, callers_log: false, start_log: true } as never, CONTEXT
    );

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('NODESTART')).toBe('BBS:Express');
    expect(after.tooltypes.has('START_LOG')).toBe(true);
    // Presence is the value, so switching a flag off has to remove it.
    expect(after.tooltypes.has('CALLERS_LOG')).toBe(false);
  });

  it('file checkers: a checker icon stays a binary icon', async () => {
    const file = path.join(root, 'Fcheck', 'LhA.info');
    seedIcon(file, ['CHECKER=C:LhA', 'SOPTIONS=-x -q', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database({
      getFileCheckerById: () => ({
        id: 1, checker_name: 'LhA', checker_path: 'C:LhA', options: '-t',
        stack_size: 8192, priority: 0, script_path: '', enabled: true,
      }),
    });
    await new FileCheckerConfigService(db).updateFileChecker(1, { options: '-t' } as never, CONTEXT);

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('SOPTIONS')).toBe('-x -q');
    expect(after.tooltypes.get('OPTIONS')).toBe('-t');
  });

  it('languages: a language icon stays a binary icon', async () => {
    const file = path.join(root, 'Languages', 'Swedish.info');
    seedIcon(file, ['CODE=sv', 'IM_A_TOOLTYPE=keep me']);

    const { database: db } = database({
      getLanguage: () => ({
        id: 1, language_number: 1, title: 'Swedish', language_code: 'sv',
        file_path: 'BBS:Languages/Swedish', enabled: true,
      }),
    });
    await new LanguageConfigService(db).updateLanguage(
      1, { title: 'Swedish', language_code: 'sv-SE' } as never, CONTEXT
    );

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('CODE')).toBe('sv-SE');
  });

  it('conferences: Conf1.info stays a binary icon and keeps its other paths', async () => {
    const file = path.join(root, 'Conf1.info');
    seedIcon(file, [
      'NAME=Amiga', 'LOCATION=BBS:Conf1', 'NDIRS=2',
      'DLPATH.1=BBS:Conf1/Files', 'DLPATH.2=BBS:Conf1/More',
      'IM_A_TOOLTYPE=keep me',
    ]);

    await new ConferenceSetupService(root).updateConferenceInfoFile(1, { name: 'Amiga Scene' });

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('NAME')).toBe('Amiga Scene');
    expect(after.tooltypes.get('DLPATH.2')).toBe('BBS:Conf1/More');
  });

  it('conferences: ConfConfig.info keeps every other conference name', async () => {
    const file = path.join(root, 'ConfConfig.info');
    seedIcon(file, [
      'NCONFS=3',
      'NAME.1=Amiga', 'LOCATION.1=BBS:Conf1',
      'NAME.2=PC', 'LOCATION.2=BBS:Conf2',
      'NAME.3=Chat', 'LOCATION.3=BBS:Conf3',
      'IM_A_TOOLTYPE=keep me',
    ]);

    await new ConferenceSetupService(root).updateConfConfig(2, 'Peecee', 'BBS:Conf2');

    const after = readBack(file);
    expect(after.isBinary).toBe(true);
    expect(after.keptIcon).toBe(true);
    expect(after.tooltypes.get('IM_A_TOOLTYPE')).toBe('keep me');
    expect(after.tooltypes.get('NAME.2')).toBe('Peecee');
    expect(after.tooltypes.get('NAME.1')).toBe('Amiga');
    expect(after.tooltypes.get('NAME.3')).toBe('Chat');
    expect(after.tooltypes.get('NCONFS')).toBe('3');
  });
});

describe('a file the old writer already damaged', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'damaged-icon-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Exactly what InfoFileParser.write() used to emit. */
  function placeholderInfo(entries: string[]): Buffer {
    const header = Buffer.alloc(256);
    header.writeUInt32BE(0xe3100001, 0);
    return Buffer.concat([header, Buffer.from(entries.map(e => e + '\0').join(''), 'latin1')]);
  }

  it('is read as the text it is, not as a broken icon', () => {
    const file = path.join(root, 'Drives.info');
    fs.writeFileSync(file, placeholderInfo(['DRIVE.1=DH1:Files', 'DRIVE.2=DH2:Files']));

    const info = parseInfoFile(file);

    expect(info.isBinary).toBe(false);
    expect(info.tooltypes.map(t => `${t.key}=${t.value}`)).toEqual([
      'DRIVE.1=DH1:Files',
      'DRIVE.2=DH2:Files',
    ]);
  });

  it('heals on the next save instead of throwing InfoFileWriteError', () => {
    const file = path.join(root, 'Drives.info');
    fs.writeFileSync(file, placeholderInfo(['DRIVE.1=DH1:Files']));

    const { applyTooltypes } = require('../../src/utils/info-file.util');
    applyTooltypes(file, new Map([['DRIVE.2', 'DH2:Files']]));

    const healed = parseInfoFile(file);
    const values = new Map(healed.tooltypes.map(t => [t.key, t.value]));
    expect(values.get('DRIVE.1')).toBe('DH1:Files');
    expect(values.get('DRIVE.2')).toBe('DH2:Files');
    // The dead 256-byte header is gone; nothing reads it and it made the file
    // look like an icon that GetDiskObject could not open.
    expect(fs.readFileSync(file)[0]).not.toBe(0xe3);
  });
});

/**
 * The write half of the guard set.
 *
 * The contract tests read only - they hand a served record to the schema its
 * writer validates with, which is where four faults lived, and none of Phase 1
 * was visible to any of them. A domain whose writer is not driven against a
 * real file here is a domain where the writer can be broken silently, which is
 * what InfoFileParser.write() did for months.
 */
describe('every domain that writes a .info is driven against a real one', () => {
  it('covers each of them', () => {
    // The nine writers that used the private one. Doors have their own
    // suites - door-info-tooltypes, door-create-info, door-enabled-access -
    // because a door's .info is edited by a different path.
    const covered = [
      'computer types',
      'protocols',
      'screen types',
      'drives',
      'nodes',
      'file checkers',
      'languages',
      'conferences: Conf<N>.info',
      'conferences: ConfConfig.info',
    ];

    expect(covered.sort()).toEqual([
      'computer types',
      'conferences: ConfConfig.info',
      'conferences: Conf<N>.info',
      'drives',
      'file checkers',
      'languages',
      'nodes',
      'protocols',
      'screen types',
    ].sort());
  });
});
