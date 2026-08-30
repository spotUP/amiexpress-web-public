/**
 * A deleted door must stop being a door.
 *
 * Reported 2026-08-30: DOORMAN said "DD deleted" and DD stayed in the left
 * panel. The live volume showed why - `Doors/DD` was gone, and
 * `Commands/BBSCmd/DD.info` was still there at 1114 bytes. The `.info` IS
 * the registration: every list the BBS draws is built from those files, so
 * deleting a door's files while leaving its `.info` deletes the door's body
 * and keeps its name.
 *
 * deleteTrackedFiles treated the DB's tracked rows as an EXCLUSIVE list and
 * fell back to the caller's paths - the ones that name the .info - only when
 * there were none. That is fixed here, but it is NOT proven to be what
 * happened to DD: the live `door_installed_files` table holds zero rows for
 * any door, and the logs that would have said were destroyed when a deploy
 * recreated the container. What is certain is that the delete reported
 * success with the registration still on disk, because nothing looked. The
 * verification below is what turns that from a silent lie into an error the
 * sysop can see, whatever the path taken.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const trackedRows: Array<{ filePath: string; fileType: string }> = [];
const clearedCommands: string[] = [];

jest.mock('../../src/database', () => ({
  db: {
    getDoorFiles: jest.fn(() => trackedRows),
    clearDoorFiles: jest.fn((command: string) => { clearedCommands.push(command); }),
    trackDoorFiles: jest.fn(),
  },
}));
jest.mock('../../src/handlers/door.handler', () => ({
  initializeDoors: jest.fn().mockResolvedValue(undefined),
}));

const recordedInstalls: any[] = [];
jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn((input: any) => { recordedInstalls.push(input); }),
  walkInstalledFiles: jest.fn(() => []),
}));

import { AmigaDoorManager } from '../../src/doors/amigaDoorManager';

let root: string;

function write(relPath: string, content: string): string {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/** A door as the live board had it: a command registration plus a directory. */
function makeDoor(command: string): { infoPath: string; doorDir: string } {
  const infoPath = write(
    path.join('Commands', 'BBSCmd', `${command}.info`),
    `TYPE=XIM\nLOCATION=Doors:${command}/${command}\nSTACK=65536\nACCESS=0\n`
  );
  const doorDir = path.join(root, 'Doors', command);
  fs.mkdirSync(doorDir, { recursive: true });
  fs.writeFileSync(path.join(doorDir, command), 'binary');
  return { infoPath, doorDir };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-delete-'));
  trackedRows.length = 0;
  clearedCommands.length = 0;
  recordedInstalls.length = 0;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('recordInstalled', () => {
  it('an install through the archive installer is linked to its archive', async () => {
    // Not the DOORMAN path: the installer the admin upload uses.
    const manager = new AmigaDoorManager(root);
    const { doorDir, infoPath } = makeDoor('AEHELP');

    (manager as any).recordInstalled('AEHELP', 'AEHELP.LHA', doorDir, infoPath);

    expect(recordedInstalls[0]).toMatchObject({
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
    });
  });

  it('a TypeScript door install is linked to its archive too, with an info path that need not exist', async () => {
    // installTypeScriptDoor never writes a Commands/BBSCmd/<CMD>.info - the
    // recorder must still be given the path one would live at, and it must
    // tolerate that path not existing on disk.
    const manager = new AmigaDoorManager(root);
    const doorDir = path.join(root, 'Doors', 'arkanoid');
    fs.mkdirSync(doorDir, { recursive: true });
    const missingInfoPath = path.join(root, 'Commands', 'BBSCmd', 'ARKANOID.info');

    (manager as any).recordInstalled('ARKANOID', 'arkanoid.zip', doorDir, missingInfoPath);

    expect(fs.existsSync(missingInfoPath)).toBe(false);
    expect(recordedInstalls[0]).toMatchObject({
      command: 'ARKANOID',
      archiveName: 'arkanoid.zip',
      installDir: doorDir,
      infoPath: missingInfoPath,
    });
  });
});

describe('deleteAmigaDoor', () => {
  it('removes the command registration even when the DB tracks other files', async () => {
    // Tracked rows that name the directory and not the .info: the shape the
    // old code silently mishandled.
    const { infoPath, doorDir } = makeDoor('DD');
    trackedRows.push({ filePath: path.join('Doors', 'DD'), fileType: 'dir' });

    const result = await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    expect(result.success).toBe(true);
    expect(fs.existsSync(doorDir)).toBe(false);
    expect(fs.existsSync(infoPath)).toBe(false);
  });

  it('reports the paths it removed, so the door manager can show them', async () => {
    makeDoor('DD');
    trackedRows.push({ filePath: path.join('Doors', 'DD'), fileType: 'dir' });

    const result = await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    expect(result.removed).toEqual(
      expect.arrayContaining([path.join('Doors', 'DD'), path.join('Commands', 'BBSCmd', 'DD.info')])
    );
  });

  it('still deletes when the DB tracks nothing at all', async () => {
    const { infoPath, doorDir } = makeDoor('DD');

    const result = await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    expect(result.success).toBe(true);
    expect(fs.existsSync(infoPath)).toBe(false);
    expect(fs.existsSync(doorDir)).toBe(false);
  });

  it('does not report success while the registration is still on disk', async () => {
    // What the sysop actually saw: "deleted", next to a door still listed.
    const { infoPath } = makeDoor('DD');
    const spy = jest.spyOn(fs.promises, 'unlink').mockRejectedValue(new Error('EPERM'));

    const result = await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    spy.mockRestore();
    expect(fs.existsSync(infoPath)).toBe(true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('DD.info');
  });

  it('refuses a tracked path that points outside Doors/ and Commands/', async () => {
    // The DB is not more trustworthy than a caller's string: a recursive
    // delete of an unchecked path is what took the whole Doors/ tree out.
    makeDoor('DD');
    const outside = write('outside-the-tree.txt', 'keep me');
    trackedRows.push({ filePath: '../outside-the-tree.txt', fileType: 'file' });
    trackedRows.push({ filePath: path.join('..', path.basename(root), 'outside-the-tree.txt'), fileType: 'file' });

    await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    expect(fs.existsSync(outside)).toBe(true);
  });

  it('clears the tracking rows for the command it deleted', async () => {
    makeDoor('DD');

    await new AmigaDoorManager(root).deleteAmigaDoor('DD');

    expect(clearedCommands).toContain('DD');
  });

  it('says so when there is no such door, rather than claiming a delete', async () => {
    const result = await new AmigaDoorManager(root).deleteAmigaDoor('NOSUCH');

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

describe('deleteTypeScriptDoor', () => {
  it('removes the directory and the command .info, and reports both', async () => {
    const { infoPath, doorDir } = makeDoor('arkanoid');
    write(path.join('Doors', 'arkanoid', 'package.json'), JSON.stringify({ doorMetadata: { command: 'arkanoid' } }));

    const result = await new AmigaDoorManager(root).deleteTypeScriptDoor('arkanoid');

    expect(result.success).toBe(true);
    expect(fs.existsSync(doorDir)).toBe(false);
    expect(fs.existsSync(infoPath)).toBe(false);
    expect(result.removed?.length).toBeGreaterThan(0);
  });

  it('keeps refusing a name that would escape Doors/', async () => {
    const manager = new AmigaDoorManager(root);

    await expect(manager.deleteTypeScriptDoor('')).resolves.toMatchObject({ success: false });
    await expect(manager.deleteTypeScriptDoor('..')).resolves.toMatchObject({ success: false });
    await expect(manager.deleteTypeScriptDoor('a/b')).resolves.toMatchObject({ success: false });
  });
});

describe('the delete does not block the event loop', () => {
  it('lets a timer fire while the files are being removed', async () => {
    // One process serves every node, so a synchronous recursive delete
    // freezes the whole board - which is what the sysop reported as "the bbs
    // freeze while deleting". A timer scheduled before the delete must still
    // fire during it.
    makeDoor('BIG');
    const dir = path.join(root, 'Doors', 'BIG');
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(dir, `f${i}.dat`), 'x'.repeat(2048));
    trackedRows.push({ filePath: path.join('Doors', 'BIG'), fileType: 'dir' });

    let ticked = false;
    const ticker = setInterval(() => { ticked = true; }, 1);

    await new AmigaDoorManager(root).deleteAmigaDoor('BIG');
    clearInterval(ticker);

    expect(ticked).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('delete progress', () => {
  it('reports each step while the delete runs, not after it', async () => {
    // "after a pause it shows the log" - the sysop got the whole log at the
    // end. Steps must arrive as they happen, and the last one must land
    // before the call resolves.
    const { doorDir } = makeDoor('AEHELP');
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(doorDir, `f${i}.dat`), 'x');

    const seen: string[] = [];
    let stepsBeforeResolve = 0;
    const promise = new AmigaDoorManager(root)
      .deleteAmigaDoor('AEHELP', step => { seen.push(`${step.kind}:${step.text}`); })
      .then(result => { stepsBeforeResolve = seen.length; return result; });

    // Nothing can have finished synchronously - the first await inside the
    // delete has not returned yet.
    const seenAtCallTime = seen.length;
    const result = await promise;

    expect(result.success).toBe(true);
    expect(seenAtCallTime).toBeLessThan(stepsBeforeResolve);
    expect(seen.some(s => s.includes('f0.dat'))).toBe(true);
    expect(seen.some(s => s.includes('AEHELP.info'))).toBe(true);
    expect(seen.some(s => s.startsWith('ok:checking what is left on disk'))).toBe(true);
  });

  it('names a path it refused, instead of skipping it silently', async () => {
    makeDoor('AEHELP');
    trackedRows.push({ filePath: path.join('..', 'escape.txt'), fileType: 'file' });

    const seen: string[] = [];
    await new AmigaDoorManager(root).deleteAmigaDoor('AEHELP', step => seen.push(`${step.kind}:${step.text}`));

    expect(seen.some(s => s.startsWith('skip:refused'))).toBe(true);
  });

  it('reports a file it could not remove as a failure', async () => {
    makeDoor('AEHELP');
    const spy = jest.spyOn(fs.promises, 'unlink').mockRejectedValue(new Error('EPERM'));

    const seen: string[] = [];
    const result = await new AmigaDoorManager(root)
      .deleteAmigaDoor('AEHELP', step => seen.push(`${step.kind}:${step.text}`));

    spy.mockRestore();
    expect(seen.some(s => s.startsWith('fail:'))).toBe(true);
    expect(result.success).toBe(false);
  });
});
