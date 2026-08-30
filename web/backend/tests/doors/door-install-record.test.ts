import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tracked: Array<{ command: string; entries: any[] }> = [];
const installs: any[] = [];
// A minimal in-memory door_installed_files table, matching the real
// trackDoorFiles/clearDoorFiles/getDoorFiles semantics (trackDoorFiles
// replaces a command's rows entirely; clearDoorFiles empties them) - real
// enough to prove the uninstall -> reinstall cycle leaves no stale rows.
const fileTable = new Map<string, any[]>();

jest.mock('../../src/database', () => ({
  db: {
    trackDoorFiles: jest.fn((command: string, entries: any[]) => {
      tracked.push({ command, entries });
      fileTable.set(command.toUpperCase(), entries);
    }),
    clearDoorFiles: jest.fn((command: string) => {
      fileTable.delete(command.toUpperCase());
    }),
    getDoorFiles: jest.fn((command: string) => fileTable.get(command.toUpperCase()) ?? []),
  },
}));
jest.mock('../../src/doors/door-installs.repository', () => ({
  recordInstall: jest.fn((entry: any) => { installs.push(entry); }),
}));

import { recordDoorInstall, walkInstalledFiles, clearInstalledFiles } from '../../src/doors/door-install-record';
import { db } from '../../src/database';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-record-'));
  tracked.length = 0;
  installs.length = 0;
  fileTable.clear();
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

  it('still walks the rest of the tree when a subdirectory cannot be read', () => {
    // A real EACCES, not a mocked one - readdirSync must be guarded the same
    // way statSync already is, so one unreadable subtree cannot throw out of
    // the whole walk. Skipped when running as root: root ignores directory
    // permission bits, so the precondition (readdirSync actually failing)
    // cannot be created.
    if (process.getuid && process.getuid() === 0) {
      return;
    }

    const dataDir = path.join(root, 'Doors', 'AEHELP', 'data');
    fs.chmodSync(dataDir, 0o000);

    let entries: ReturnType<typeof walkInstalledFiles> = [];
    try {
      expect(() => {
        entries = walkInstalledFiles(
          root,
          path.join(root, 'Doors', 'AEHELP'),
          path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info')
        );
      }).not.toThrow();
    } finally {
      // Restore so afterEach's recursive rmSync can enumerate it.
      fs.chmodSync(dataDir, 0o755);
    }

    const paths = entries.map(e => e.filePath);
    // The unreadable subdirectory is itself still recorded (its own stat
    // succeeded) - only its contents are skipped.
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'data'));
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'AEHelp'));
    expect(paths).not.toContain(path.join('Doors', 'AEHELP', 'data', 'help.txt'));
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

  it('is total: a file-walk failure cannot escape and fail the install', () => {
    // Before this fix, an unguarded readdirSync inside the walk (which runs
    // OUTSIDE recordDoorInstall's own try blocks) would throw straight out
    // of this function and into installDoor's try, reporting {success:
    // false} for a door that had already installed correctly. A real
    // EACCES on the install directory itself, not a mocked one.
    if (process.getuid && process.getuid() === 0) {
      return;
    }

    const installDir = path.join(root, 'Doors', 'AEHELP');
    fs.chmodSync(installDir, 0o000);

    try {
      expect(() => {
        recordDoorInstall({
          bbsRoot: root,
          command: 'AEHELP',
          archiveName: 'AEHELP.LHA',
          installDir,
          infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
        });
      }).not.toThrow();
    } finally {
      fs.chmodSync(installDir, 0o755);
    }

    // The install row must still be written even though the file walk
    // could not enumerate the install directory's contents.
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({ command: 'AEHELP', archive_name: 'AEHELP.LHA' });
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

describe('clearInstalledFiles', () => {
  it('empties the file rows for a command', () => {
    recordDoorInstall({
      bbsRoot: root,
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
      installDir: path.join(root, 'Doors', 'AEHELP'),
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
    });
    expect(db.getDoorFiles('AEHELP').length).toBeGreaterThan(0);

    clearInstalledFiles('AEHELP');

    expect(db.getDoorFiles('AEHELP')).toEqual([]);
  });

  it('does not throw when the underlying clear fails', () => {
    (db.clearDoorFiles as jest.Mock).mockImplementationOnce(() => { throw new Error('db locked'); });

    expect(() => clearInstalledFiles('AEHELP')).not.toThrow();
  });
});

describe('install -> uninstall -> reinstall under the same command', () => {
  it('leaves no stale door_installed_files rows for a door installed in its place', () => {
    // The exact scenario the fix targets: DOORMAN's uninstall used to remove
    // the .info and the install_dir and drop the door_installs row, but
    // never cleared door_installed_files - so a later delete could act on
    // the PREVIOUS door's file list instead of the one actually installed
    // under that command now.

    // 1. Door A installed as WHO.
    recordDoorInstall({
      bbsRoot: root,
      command: 'WHO',
      archiveName: 'who-a.lha',
      installDir: path.join(root, 'Doors', 'AEHELP'), // reuses the fixture tree
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
    });
    const filesFromA = db.getDoorFiles('WHO').map(f => f.filePath);
    expect(filesFromA.length).toBeGreaterThan(0);

    // 2. Uninstall: this is the call DOORMAN's uninstall now makes
    // alongside removeInstall - the fix under test.
    clearInstalledFiles('WHO');
    expect(db.getDoorFiles('WHO')).toEqual([]);

    // 3. A DIFFERENT door B is installed under the same reused command WHO,
    // with a completely different file list.
    const otherDir = path.join(root, 'Doors', 'OTHER');
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(path.join(otherDir, 'DoorB'), 'binary-b');
    recordDoorInstall({
      bbsRoot: root,
      command: 'WHO',
      archiveName: 'who-b.lha',
      installDir: otherDir,
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
    });

    const filesFromB = db.getDoorFiles('WHO').map(f => f.filePath);
    // Nothing from door A survives under command WHO.
    for (const staleFromA of filesFromA) {
      if (staleFromA.startsWith(path.join('Doors', 'AEHELP'))) {
        expect(filesFromB).not.toContain(staleFromA);
      }
    }
    expect(filesFromB).toContain(path.join('Doors', 'OTHER', 'DoorB'));
  });
});
