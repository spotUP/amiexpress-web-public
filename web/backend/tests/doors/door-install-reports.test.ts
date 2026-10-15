/**
 * A door tells the BBS what it installed by writing a file, not by calling.
 *
 * report_install_to_bbs POSTed to /api/door-admin/installed and has never
 * worked on this board: the emulator runs in the backend's Node process, so
 * a door blocking on the reply starves the event loop that would produce it
 * (door-list-snapshot.ts carries the measurement - a 30-second timeout, and
 * the answer arriving afterwards unread). The consequence was door_installs
 * having no row for anything DoorRepo installed: no catalog name, no
 * description, and no recorded file list for a later delete to work from.
 *
 * The door appends a line now, and the BBS reads it when the door exits.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  parseInstallReport,
  applyDoorInstallReports,
  doorInstallReportPath,
} from '../../src/doors/door-install-reports';

describe('parsing what the door wrote', () => {
  it('reads a report the door writes', () => {
    expect(parseInstallReport('INSTALL|CALC|CALC.LHA')).toEqual({
      command: 'CALC',
      archiveName: 'CALC.LHA',
    });
  });

  it('upper-cases the command, as every other path does', () => {
    expect(parseInstallReport('INSTALL|calc|CALC.LHA')?.command).toBe('CALC');
  });

  it('keeps an archive name containing the separator', () => {
    // The catalog holds thousands of names and some carry anything at all.
    // Only the command is constrained, so everything after the second bar
    // is the name.
    expect(parseInstallReport('INSTALL|X|weird|name.lha')?.archiveName).toBe('weird|name.lha');
  });

  it('refuses a command name that is a path', () => {
    // The door runs as the sysop; that is not a reason to take ../ from a
    // file. Same rule the HTTP route applies.
    expect(parseInstallReport('INSTALL|../../etc/passwd|X.LHA')).toBeNull();
    expect(parseInstallReport('INSTALL|a/b|X.LHA')).toBeNull();
    expect(parseInstallReport('INSTALL|WAYTOOLONGCOMMAND|X.LHA')).toBeNull();
  });

  it('ignores blanks, short lines and verbs it does not know', () => {
    // The file may have been written by an older build of the door.
    expect(parseInstallReport('')).toBeNull();
    expect(parseInstallReport('INSTALL|CALC')).toBeNull();
    expect(parseInstallReport('UNINSTALL|CALC|CALC.LHA')).toBeNull();
    expect(parseInstallReport('INSTALL|CALC|')).toBeNull();
  });
});

describe('applying them on the door\'s exit', () => {
  let root: string;

  function queue(lines: string[]): void {
    const file = doorInstallReportPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join('\n') + '\n', 'latin1');
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-report-'));
    fs.mkdirSync(path.join(root, 'Doors', 'CALC'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'CALC', 'calc'), 'binary');
    fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'CALC.info'),
      'TYPE=XIM\nLOCATION=Doors:CALC/calc\n');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('does nothing when the door reported nothing', () => {
    expect(applyDoorInstallReports(root)).toEqual([]);
  });

  it('records what the door installed', () => {
    queue(['INSTALL|CALC|CALC.LHA']);

    const recorded = applyDoorInstallReports(root);

    expect(recorded).toEqual([{ command: 'CALC', archiveName: 'CALC.LHA' }]);
  });

  it('consumes the file, so an install is not recorded twice', () => {
    queue(['INSTALL|CALC|CALC.LHA']);

    applyDoorInstallReports(root);

    expect(fs.existsSync(doorInstallReportPath(root))).toBe(false);
    expect(applyDoorInstallReports(root)).toEqual([]);
  });

  it('records the good lines and skips the bad ones in the same file', () => {
    queue(['INSTALL|CALC|CALC.LHA', 'nonsense', 'INSTALL|../evil|X.LHA']);

    const recorded = applyDoorInstallReports(root);

    expect(recorded.map(r => r.command)).toEqual(['CALC']);
  });
});
