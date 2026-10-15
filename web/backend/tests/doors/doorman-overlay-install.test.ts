/**
 * "doorrepo and doorman fails to install this door" - MST-FD11.LHA, File
 * Description 1.1, sysop 2026-09-29.
 *
 * The archive is an overlay of the BBS:
 *
 *   Commands/BBScmd/SENT.info        LOCATION=DOORS:FileDescription/FileDescription.x
 *   Commands/Syscmd/EXAMINE.info     (same LOCATION)
 *   Doors/FileDescription/FileDescription000.x, ...020.x   (no plain .x)
 *
 * The author's text: copy the icons, make Doors:FileDescription, copy the
 * program there, "Copy FileDescription020.x FileDescription.x". DOORMAN
 * extracted the lot into Doors/SENT/, so the icon led to nothing, the SysCmd
 * icon was never installed, there was no FileDescription.x - and it said
 * "Installed".
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractAndRegisterDoor } from '../../../../Doors/door-manager/install-core';

/** An Amiga icon's tooltypes as they sit on disk: u32 length, text, NUL. */
const tooltype = (text: string) => {
  const body = Buffer.from(`${text}\0`, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, body]);
};
const icon = () =>
  Buffer.concat([
    Buffer.from([0xe3, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
    tooltype('LOCATION=DOORS:FileDescription/FileDescription.x'),
    tooltype('TYPE=XIM'),
    tooltype('STACK=10000'),
  ]);

/** What the archive holds, written where extraction would put it. */
function extractOverlay(destDir: string, opts: { cpuBuilds?: boolean; files?: string[] } = {}) {
  const write = (rel: string, data: Buffer | string) => {
    const full = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
  };
  write('Commands/BBScmd/SENT.info', icon());
  write('Commands/Syscmd/EXAMINE.info', icon());
  if (opts.cpuBuilds !== false) {
    write('Doors/FileDescription/FileDescription000.x', 'M68000 BUILD');
    write('Doors/FileDescription/FileDescription020.x', 'M68020 BUILD');
  }
  write('Doors/FileDescription/FileDescription.Config', 'Config_Access: 20');
  write('file_id.diz', 'ad');
  return { ok: true, fileCount: 6 };
}

let root: string;
let recorded: Array<{ command: string; dir: string; archive: string; extras?: unknown }>;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-install-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  recorded = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function install(opts?: Parameters<typeof extractOverlay>[1]) {
  const installDir = path.join(root, 'Doors', 'MSTFD11');
  fs.mkdirSync(installDir, { recursive: true });
  return extractAndRegisterDoor(
    'MST-FD11.LHA', installDir, path.join(root, 'Commands', 'BBSCmd', 'MSTFD11.info'), 'XIM', 'FileDescription.x', 'MSTFD11',
    {
      extractArchiveTo: async (_a, dest) => extractOverlay(dest, opts),
      findExtractedBinary: () => null,
      writeInfoFile: (p, c) => fs.writeFileSync(p, c),
      recordInstall: (command, dir, archive, extras) => recorded.push({ command, dir, archive, extras }),
      refreshDoorRegistry: async () => true,
    },
    'MST-FD11.LHA'
  );
}

describe('an archive that is an overlay of the BBS', () => {
  it('installs the door under the archive\'s own name, so the icon\'s LOCATION is true', async () => {
    const outcome = await install();
    expect(outcome.ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'Doors', 'FileDescription', 'FileDescription.Config'))).toBe(true);
    // not nested under the command, and the staging is gone
    expect(fs.existsSync(path.join(root, 'Doors', 'SENT'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'Doors', 'MSTFD11'))).toBe(false);
    expect(fs.readdirSync(path.join(root, 'Doors'))).toEqual(['FileDescription']);
  });

  it('installs every command icon the archive carries, byte for byte, each in its own directory', async () => {
    await install();
    expect(fs.readFileSync(path.join(root, 'Commands', 'BBSCmd', 'SENT.info')).equals(icon())).toBe(true);
    expect(fs.readFileSync(path.join(root, 'Commands', 'SysCmd', 'EXAMINE.info')).equals(icon())).toBe(true);
  });

  it('makes the program the icon names from the per-CPU builds, choosing the 68000 one', async () => {
    const outcome = await install();
    expect(fs.readFileSync(path.join(root, 'Doors', 'FileDescription', 'FileDescription.x'), 'utf8')).toBe('M68000 BUILD');
    // the builds themselves stay
    expect(fs.existsSync(path.join(root, 'Doors', 'FileDescription', 'FileDescription020.x'))).toBe(true);
    expect(outcome.ok && outcome.binaryRel).toBe('FileDescription/FileDescription.x');
  });

  it('records the install as its BBS command, in the door\'s real directory, with the SysCmd icon as an extra file', async () => {
    await install();
    expect(recorded).toEqual([{
      command: 'SENT',
      dir: 'Doors/FileDescription',
      archive: 'MST-FD11.LHA',
      extras: { files: [path.join(root, 'Commands', 'SysCmd', 'EXAMINE.info')], wroteCommandIcon: true },
    }]);
  });

  it('does not overwrite a door that is already there, and leaves nothing behind', async () => {
    fs.mkdirSync(path.join(root, 'Doors', 'FileDescription'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'FileDescription', 'MINE'), 'keep');
    const outcome = await install();
    expect(outcome.ok).toBe(false);
    expect(fs.readFileSync(path.join(root, 'Doors', 'FileDescription', 'MINE'), 'utf8')).toBe('keep');
    expect(fs.existsSync(path.join(root, 'Commands', 'SysCmd', 'EXAMINE.info'))).toBe(false);
    expect(recorded).toEqual([]);
  });

  it('a command that already exists is kept, not overwritten', async () => {
    fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'SENT.info'), 'SOMEONE ELSE');
    const outcome = await install();
    expect(outcome.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, 'Commands', 'BBSCmd', 'SENT.info'), 'utf8')).toBe('SOMEONE ELSE');
    expect(fs.existsSync(path.join(root, 'Commands', 'SysCmd', 'EXAMINE.info'))).toBe(true);
    expect(recorded[0].command).toBe('EXAMINE');
  });

  it('an overlay whose icons lead nowhere in it is left to the flat install, not failed', async () => {
    const outcome = await install({ cpuBuilds: false });
    // no FileDescription*.x at all: not something the overlay path can place
    expect(recorded.every((r) => r.dir !== 'Doors/FileDescription')).toBe(true);
    expect(outcome.ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'Doors', 'FileDescription'))).toBe(false);
  });
});

describe('a record left by an install whose command icon is gone', () => {
  // SENT, 2026-09-29: door_installs still said SENT belonged to TRSI-F20.LHA
  // although its SENT.info had been removed. The overlay wrote a fresh
  // SENT.info, the collision guard saw the old row, refused to record, and the
  // door showed as not installed with nothing tracked to delete.
  it('is superseded by an install that wrote the command\'s icon itself', async () => {
    await install();
    const extras = recorded[0].extras as { wroteCommandIcon: boolean };
    expect(extras.wroteCommandIcon).toBe(true);
  });

  it('still guards a flat install, which says nothing about having written the icon', async () => {
    const installDir = path.join(root, 'Doors', 'FLAT');
    fs.mkdirSync(installDir, { recursive: true });
    await extractAndRegisterDoor(
      'FLAT.LHA', installDir, path.join(root, 'Commands', 'BBSCmd', 'FLAT.info'), 'XIM', 'prog', 'FLAT',
      {
        extractArchiveTo: async (_a, dest) => {
          fs.writeFileSync(path.join(dest, 'prog'), 'x');
          return { ok: true, fileCount: 1 };
        },
        findExtractedBinary: () => 'prog',
        writeInfoFile: (p, c) => fs.writeFileSync(p, c),
        recordInstall: (command, dir, archive, extras) => recorded.push({ command, dir, archive, extras }),
        refreshDoorRegistry: async () => true,
      },
      'FLAT.LHA'
    );
    expect(recorded[0].extras).toBeUndefined();
  });
});
