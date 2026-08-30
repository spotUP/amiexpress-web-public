import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tracked: Array<{ command: string; entries: any[] }> = [];
const installs: any[] = [];

jest.mock('../../src/database', () => ({
  db: { trackDoorFiles: jest.fn((command: string, entries: any[]) => { tracked.push({ command, entries }); }) },
}));
jest.mock('../../src/doors/door-installs.repository', () => ({
  recordInstall: jest.fn((entry: any) => { installs.push(entry); }),
}));

import { recordDoorInstall, walkInstalledFiles } from '../../src/doors/door-install-record';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-record-'));
  tracked.length = 0;
  installs.length = 0;
  fs.mkdirSync(path.join(root, 'Doors', 'AEHELP', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'AEHELP', 'AEHelp'), 'binary');
  fs.writeFileSync(path.join(root, 'Doors', 'AEHELP', 'data', 'help.txt'), 'text');
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'), 'TYPE=XIM\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('walkInstalledFiles', () => {
  it('lists what is on disk, relative to the BBS root', () => {
    const entries = walkInstalledFiles(
      root,
      path.join(root, 'Doors', 'AEHELP'),
      path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info')
    );

    const paths = entries.map(e => e.filePath);
    expect(paths).toContain(path.join('Commands', 'BBSCmd', 'AEHELP.info'));
    expect(paths).toContain(path.join('Doors', 'AEHELP'));
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'AEHelp'));
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'data', 'help.txt'));
    expect(entries.find(e => e.filePath === path.join('Doors', 'AEHELP'))!.fileType).toBe('dir');
    expect(entries.find(e => e.filePath.endsWith('AEHELP.info'))!.fileType).toBe('info');
  });

  it('marks a library as one, wherever it sits', () => {
    fs.mkdirSync(path.join(root, 'Libs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Libs', 'aehelp.library'), 'lib');

    const entries = walkInstalledFiles(
      root,
      path.join(root, 'Doors', 'AEHELP'),
      path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
      [path.join(root, 'Libs', 'aehelp.library')]
    );

    expect(entries.find(e => e.filePath === path.join('Libs', 'aehelp.library'))!.fileType)
      .toBe('library');
  });
});

describe('recordDoorInstall', () => {
  it('writes the link and the file list together', () => {
    recordDoorInstall({
      bbsRoot: root,
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
      installDir: path.join(root, 'Doors', 'AEHELP'),
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
      metadata: { name: 'AmiExpress Help', version: 'v1.2', sourceRevision: 'rev9' },
    });

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      command: 'AEHELP',
      archive_name: 'AEHELP.LHA',
      install_dir: path.join('Doors', 'AEHELP'),
      name: 'AmiExpress Help',
      version: 'v1.2',
      source_revision: 'rev9',
    });

    expect(tracked).toHaveLength(1);
    expect(tracked[0].command).toBe('AEHELP');
    expect(tracked[0].entries.map((e: any) => e.filePath))
      .toContain(path.join('Doors', 'AEHELP', 'AEHelp'));
  });

  it('records the files even when the install row cannot be written', () => {
    // A bookkeeping failure must not lose the file list: the delete needs it
    // more than the menu needs the metadata.
    const { recordInstall } = require('../../src/doors/door-installs.repository');
    (recordInstall as jest.Mock).mockImplementationOnce(() => { throw new Error('db locked'); });

    recordDoorInstall({
      bbsRoot: root,
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
      installDir: path.join(root, 'Doors', 'AEHELP'),
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
    });

    expect(tracked).toHaveLength(1);
  });
});
