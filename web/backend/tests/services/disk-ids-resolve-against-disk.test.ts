/**
 * An entry that exists only on disk must be editable.
 *
 * Five pages list from disk - where the id is the entry's POSITION - and then
 * looked that number up as a database rowid. Two unrelated namespaces, so the
 * update either threw "not found" or edited a different record. On this board
 * the mirror is empty or nearly so against what the files hold:
 *
 *   conferences   Conf1..14.info      3 rows
 *   nodes         8 node icons        1 row (node_number=1)
 *   languages     4 files             ids 1,3,4,5
 *   file checkers 15 files            2 rows
 *   screen types  2 entries           4 rows
 *
 * Every test here runs with an EMPTY mirror, which is the live shape, and
 * asserts the edit reached the file the BBS reads.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LanguageConfigService } from '../../src/services/config-services/language-config.service';
import { FileCheckerConfigService } from '../../src/services/config-services/file-checker-config.service';
import { ScreenConfigService } from '../../src/services/config-services/screen-config.service';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { NodeConfigService } from '../../src/services/config-services/node-config.service';
import { ConferenceConfigService } from '../../src/services/config-services/conference-config.service';
import { config as appConfig } from '../../src/config';

const CONTEXT = { userId: '1', username: 'sysop' } as never;

function seed(filePath: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(filePath, text);
}

/** A mirror that knows nothing, which is the live case. */
function emptyMirror(overrides: Record<string, unknown> = {}) {
  const repo = {
    getLanguages: () => [],
    getLanguage: () => null,
    getLanguageByCode: () => null,
    updateLanguage: () => null,
    getAllFileCheckers: () => [],
    getFileCheckerById: () => null,
    updateFileChecker: () => false,
    getAllScreenTypes: () => [],
    getScreenTypeById: () => null,
    updateScreenType: () => false,
    getAllDrives: () => [],
    getDriveById: () => null,
    getDriveByNumber: () => null,
    updateDrive: () => false,
    getConferenceConfig: () => null,
    getConferenceConfigs: () => [],
    updateConferenceConfig: () => { throw new Error('no such conference row'); },
    getNodeConfig: () => null,
    getNodeConfigs: () => [],
    updateNodeConfig: () => { throw new Error('no such node row'); },
    logConfigChange: () => undefined,
    ...overrides,
  };
  return { getConfigRepository: () => repo } as never;
}

describe('an entry that exists only on disk can be edited', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-ids-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('languages: the fourth file is editable with no rows at all', async () => {
    for (const name of ['English', 'German', 'Swedish', 'Finnish']) {
      seed(path.join(root, 'Languages', `${name}.info`), { CODE: name.slice(0, 2).toLowerCase() });
    }

    const service = new LanguageConfigService(emptyMirror());
    const all = await service.getLanguages();
    const finnish = all.find(l => l.title === 'Finnish');
    expect(finnish).toBeDefined();

    await service.updateLanguage(finnish!.id, { title: 'Finnish', language_code: 'fi-FI' } as never, CONTEXT);

    expect(readTooltypeMap(path.join(root, 'Languages', 'Finnish.info')).get('CODE')).toBe('fi-FI');
  });

  it('file checkers: the fifteenth file is editable with two rows', async () => {
    for (const name of ['LhA', 'LZX', 'DMS', 'Zip', 'Ace']) {
      seed(path.join(root, 'Fcheck', `${name}.info`), { CHECKER: `C:${name}`, OPTIONS: '-t' });
    }

    const service = new FileCheckerConfigService(emptyMirror());
    const all = await service.getAllFileCheckers();
    const ace = all.find(c => c.checker_name === 'Ace');
    expect(ace).toBeDefined();

    await service.updateFileChecker(ace!.id, { options: '-x -q' } as never, CONTEXT);

    expect(readTooltypeMap(path.join(root, 'Fcheck', 'Ace.info')).get('OPTIONS')).toBe('-x -q');
  });

  it('screen types: an entry with no row is editable', async () => {
    seed(path.join(root, 'ScreenTypes.info'), {
      'TYPE.1': 'PAL', 'TITLE.1': 'PAL:High Res',
      'TYPE.2': 'NTSC', 'TITLE.2': 'NTSC:High Res',
    });

    const service = new ScreenConfigService(emptyMirror());
    const all = await service.getAllScreenTypes();
    const ntsc = all.find(t => t.screen_type === 'NTSC');
    expect(ntsc).toBeDefined();

    await service.updateScreenType(ntsc!.id, { screen_title: 'NTSC:Lo Res' } as never, CONTEXT);

    expect(readTooltypeMap(path.join(root, 'ScreenTypes.info')).get('TITLE.2')).toBe('NTSC:Lo Res');
  });

  it('drives: an entry with no row is editable', async () => {
    seed(path.join(root, 'Drives.info'), { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });

    const service = new DriveConfigService(emptyMirror());
    const all = await service.getAllDrives();
    const second = all.find(d => d.drive_number === 2);
    expect(second).toBeDefined();

    await service.updateDrive(second!.id, { drive_path: 'DH2:Uploads' } as never, CONTEXT);

    const after = readTooltypeMap(path.join(root, 'Drives.info'));
    expect(after.get('DRIVE.2')).toBe('DH2:Uploads');
    expect(after.get('DRIVE.1')).toBe('DH1:Files');
  });

  it('conferences: the fourteenth conference is editable with three rows', async () => {
    // Conf1..14.info on disk, three rows in conference_config, so conferences
    // 4-14 answered "not found" on every save.
    seed(path.join(root, 'ConfConfig.info'), {
      NCONFS: '14',
      ...Object.fromEntries(
        Array.from({ length: 14 }, (_, i) => [`NAME.${i + 1}`, `Conference ${i + 1}`])
      ),
      ...Object.fromEntries(
        Array.from({ length: 14 }, (_, i) => [`LOCATION.${i + 1}`, `BBS:Conf${i + 1}`])
      ),
    });
    for (let i = 1; i <= 14; i++) {
      seed(path.join(root, `Conf${i}.info`), { NDIRS: '1', 'DLPATH.1': `BBS:Conf${i}/Files` });
    }

    const service = new ConferenceConfigService(emptyMirror());
    await service.updateConferenceConfig(14, { ndirs: 3 } as never, CONTEXT);

    expect(readTooltypeMap(path.join(root, 'Conf14.info')).get('NDIRS')).toBe('3');
  });

  it('conferences: a rename reaches ConfConfig.info, where express.e reads it', async () => {
    // NAME.n lives in ConfConfig.info (express.e:31852), not in Conf<N>.info.
    // ConferenceConfigSchema did not declare `name` at all, so zod stripped it
    // and the rename never reached a writer.
    seed(path.join(root, 'ConfConfig.info'), {
      NCONFS: '2',
      'NAME.1': 'Amiga', 'LOCATION.1': 'BBS:Conf1',
      'NAME.2': 'Lamer Zone', 'LOCATION.2': 'BBS:Conf2',
    });
    seed(path.join(root, 'Conf1.info'), { NDIRS: '1' });
    seed(path.join(root, 'Conf2.info'), { NDIRS: '1' });

    const service = new ConferenceConfigService(emptyMirror());
    await service.updateConferenceConfig(2, { name: 'Elite Zone' } as never, CONTEXT);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NAME.2')).toBe('Elite Zone');
    // The location must survive: the same call writes both, and an empty one
    // would erase the conference's directory (express.e:31861).
    expect(after.get('LOCATION.2')).toBe('BBS:Conf2');
    expect(after.get('NAME.1')).toBe('Amiga');
  });

  it('nodes: a node with no row still reaches its .info', async () => {
    // The mirror throws for every node but the one row it holds, and it used
    // to throw BEFORE the .info write - so nothing reached disk, and the page
    // said nothing because it had no onError.
    seed(path.join(root, 'Node3.info'), { NODESTART: 'BBS:Express', PRIORITY: '0' });

    const service = new NodeConfigService(emptyMirror());
    await service.updateNodeConfig(
      4, { node_number: 3, start_log: true, priority: 2 } as never, CONTEXT
    );

    const after = readTooltypeMap(path.join(root, 'Node3.info'));
    expect(after.has('START_LOG')).toBe(true);
    expect(after.get('PRIORITY')).toBe('2');
  });
});
