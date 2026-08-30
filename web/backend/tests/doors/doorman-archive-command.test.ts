import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findArchiveCommand,
  isUsableCommand,
} from '../../../../Doors/door-manager/archive-command';
import { extractAndRegisterDoor } from '../../../../Doors/door-manager/install-core';

/**
 * "When installing doors with doorman or doorrepo it should use the bbscmd
 * etc from the info file - it should not let the sysop choose."
 *
 * Every AmiExpress door archive names its own command. Listing a real one:
 *
 *   VCLCALC/COMMANDS/BBSCMD/CALC.info
 *   VCLCALC/DOORS/CALCULATOR/CALC.rexx
 *
 * The command is CALC, and that .info carries the tooltypes the door was
 * built with. DOORMAN asked the sysop to type a command and then wrote its
 * own four-line .info, so a door could be installed under a name it does not
 * answer to, with its STACK and PRIORITY thrown away.
 */

function makeArchiveTree(root: string, command: string, infoBytes: Buffer): string {
  const dir = path.join(root, 'VCLCALC', 'COMMANDS', 'BBSCMD');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${command}.info`), infoBytes);
  fs.mkdirSync(path.join(root, 'VCLCALC', 'DOORS', 'CALCULATOR'), { recursive: true });
  fs.writeFileSync(path.join(root, 'VCLCALC', 'DOORS', 'CALCULATOR', 'CALC.rexx'), 'say "hi"');
  return path.join(dir, `${command}.info`);
}

describe('the command an archive names', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-cmd-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds the command icon wherever the archive puts it', () => {
    makeArchiveTree(root, 'CALC', Buffer.from([0xe3, 0x10, 0x00, 0x01]));

    const found = findArchiveCommand(root);
    expect(found.chosen?.command).toBe('CALC');
    expect(found.chosen?.infoPath.endsWith(path.join('BBSCMD', 'CALC.info'))).toBe(true);
  });

  it('matches whatever case the author\'s Amiga wrote', () => {
    const dir = path.join(root, 'thing', 'Commands', 'BBSCmd');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'WALL.info'), 'TYPE=XIM\n');

    expect(findArchiveCommand(root).chosen?.command).toBe('WALL');
  });

  it('reports the extra commands rather than silently picking one', () => {
    const dir = path.join(root, 'a', 'commands', 'bbscmd');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AAA.info'), 'x');
    fs.writeFileSync(path.join(dir, 'BBB.info'), 'x');

    const found = findArchiveCommand(root);
    expect(found.chosen?.command).toBeTruthy();
    expect(found.others).toHaveLength(1);
  });

  it('finds nothing in an archive that carries no command icon', () => {
    fs.mkdirSync(path.join(root, 'DOORS', 'THING'), { recursive: true });
    fs.writeFileSync(path.join(root, 'DOORS', 'THING', 'THING'), 'binary');

    expect(findArchiveCommand(root).chosen).toBeNull();
  });

  it('refuses a command that is not usable as a filename', () => {
    expect(isUsableCommand('CALC')).toBe(true);
    expect(isUsableCommand('DOOR-2')).toBe(true);
    expect(isUsableCommand('')).toBe(false);
    expect(isUsableCommand('..')).toBe(false);
    expect(isUsableCommand('a/b')).toBe(false);
    expect(isUsableCommand('.hidden')).toBe(false);
    expect(isUsableCommand('X'.repeat(33))).toBe(false);
  });
});

describe('installing a door the archive has named', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-install-'));
    fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function deps(extracted: () => void) {
    return {
      extractArchiveTo: jest.fn().mockImplementation(async () => {
        extracted();
        return { ok: true, fileCount: 3 };
      }),
      findExtractedBinary: jest.fn().mockReturnValue('CALC'),
      writeInfoFile: jest.fn(),
      recordInstall: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
    };
  }

  it('installs under the archive\'s command, not the typed one', async () => {
    const typedDir = path.join(root, 'Doors', 'TYPEDNAME');
    const archiveInfo = Buffer.from('TYPE=XIM\nSTACK=65536\nPRIORITY=1\nNAME=Calculator\n');

    const outcome = await extractAndRegisterDoor(
      '/archives/CALC.LHA',
      typedDir,
      path.join(root, 'Commands', 'BBSCmd', 'TYPEDNAME.info'),
      'XIM',
      'CALC',
      'TYPEDNAME',
      deps(() => makeArchiveTree(typedDir, 'CALC', archiveInfo)) as never
    );

    expect(outcome.ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'Doors', 'CALC'))).toBe(true);
    expect(fs.existsSync(typedDir)).toBe(false);
    expect(fs.existsSync(path.join(root, 'Commands', 'BBSCmd', 'CALC.info'))).toBe(true);
  });

  it('installs the archive\'s own icon, keeping its tooltypes', async () => {
    // A synthesised .info carries TYPE, LOCATION, STACK=65536 and ACCESS=0
    // and nothing else - PRIORITY and NAME would be lost.
    const typedDir = path.join(root, 'Doors', 'CALC');
    const archiveInfo = Buffer.from('TYPE=XIM\nSTACK=32768\nPRIORITY=3\nNAME=Calculator\n');

    const installDeps = deps(() => makeArchiveTree(typedDir, 'CALC', archiveInfo));
    await extractAndRegisterDoor(
      '/archives/CALC.LHA',
      typedDir,
      path.join(root, 'Commands', 'BBSCmd', 'CALC.info'),
      'XIM',
      'CALC',
      'CALC',
      installDeps as never
    );

    const installed = fs.readFileSync(path.join(root, 'Commands', 'BBSCmd', 'CALC.info'), 'utf8');
    expect(installed).toContain('PRIORITY=3');
    expect(installed).toContain('NAME=Calculator');
    expect(installed).toContain('STACK=32768');
    expect(installDeps.writeInfoFile).not.toHaveBeenCalled();
  });

  it('records the command it actually installed, not the typed one', async () => {
    // The install record is what an uninstall later deletes by. A record
    // naming a directory that does not exist is how a delete goes wrong.
    const typedDir = path.join(root, 'Doors', 'TYPEDNAME');
    const installDeps = deps(() => makeArchiveTree(typedDir, 'CALC', Buffer.from('TYPE=XIM\n')));

    await extractAndRegisterDoor(
      '/archives/CALC.LHA',
      typedDir,
      path.join(root, 'Commands', 'BBSCmd', 'TYPEDNAME.info'),
      'XIM',
      'CALC',
      'TYPEDNAME',
      installDeps as never
    );

    expect(installDeps.recordInstall).toHaveBeenCalledWith('CALC', 'Doors/CALC');
  });

  it('still writes its own .info when the archive has none', async () => {
    const typedDir = path.join(root, 'Doors', 'THING');
    const installDeps = deps(() => {
      fs.mkdirSync(path.join(typedDir, 'DOORS'), { recursive: true });
      fs.writeFileSync(path.join(typedDir, 'DOORS', 'THING'), 'binary');
    });

    const outcome = await extractAndRegisterDoor(
      '/archives/THING.LHA',
      typedDir,
      path.join(root, 'Commands', 'BBSCmd', 'THING.info'),
      'XIM',
      'THING',
      'THING',
      installDeps as never
    );

    expect(outcome.ok).toBe(true);
    expect(installDeps.writeInfoFile).toHaveBeenCalled();
  });

  it('keeps the typed command when the archive\'s command is already taken', async () => {
    // Renaming onto an existing install would clobber a working door.
    fs.mkdirSync(path.join(root, 'Doors', 'CALC'), { recursive: true });
    const typedDir = path.join(root, 'Doors', 'TYPEDNAME');

    const outcome = await extractAndRegisterDoor(
      '/archives/CALC.LHA',
      typedDir,
      path.join(root, 'Commands', 'BBSCmd', 'TYPEDNAME.info'),
      'XIM',
      'CALC',
      'TYPEDNAME',
      deps(() => makeArchiveTree(typedDir, 'CALC', Buffer.from('TYPE=XIM\n'))) as never
    );

    expect(outcome.ok).toBe(true);
    expect(fs.existsSync(typedDir)).toBe(true);
    expect(outcome.ok && outcome.steps.some(s => s.kind === 'skip' && s.text.includes('already exists'))).toBe(true);
  });
});
