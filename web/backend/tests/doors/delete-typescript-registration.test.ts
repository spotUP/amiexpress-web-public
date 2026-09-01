/**
 * A TypeScript door's registration must go with it, whatever it is called.
 *
 * Reported live on 2026-08-31: deleting GWWALL in DOORMAN removed the files
 * and left the door in the list - "The files were removed but GWWALL is still
 * in the door list."
 *
 * GWWALL.info is TYPE=TS, LOCATION=Doors/bbslinkwall: the command and the
 * directory have different names, which is ordinary. The TypeScript delete
 * path rebuilt the command name from the door's DIRECTORY name and then
 * looked for a BBSCMD tooltype to correct it - and this board's .info files
 * mostly have no BBSCMD tooltype at all, because the FILENAME is the command
 * (loadCommandFromInfo: "Many .info files don't have explicit BBSCMD/SYSCMD -
 * the filename IS the command"). With no such tooltype it gave up and left
 * the registration behind.
 *
 * The registration is what puts a door in every list the BBS draws, so a
 * delete that leaves it has not deleted the door. The fix is the same rule
 * the rest of the delete now follows: find the registrations that point at
 * this door, rather than guessing what they must be called.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AmigaDoorManager } from '../../src/doors/amigaDoorManager';

let root: string;
let manager: AmigaDoorManager;

function writeInfo(name: string, lines: string[]): string {
  const dir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.info`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/** A TypeScript door: a directory with a dist/ in it, no Amiga binary. */
function makeTsDoor(dirName: string): string {
  const dir = path.join(root, 'Doors', dirName);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.ts'), 'export {}');
  fs.writeFileSync(path.join(dir, 'dist', 'index.js'), 'module.exports = {}');
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delete-'));
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  manager = new AmigaDoorManager(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('removes the registration when the command and the directory have different names', async () => {
  // GWWALL -> Doors/bbslinkwall, and no BBSCMD tooltype to tie them together.
  const dir = makeTsDoor('bbslinkwall');
  const info = writeInfo('GWWALL', ['TYPE=TS', 'LOCATION=Doors/bbslinkwall', 'ACCESS=0']);

  const result = await manager.deleteDoor('GWWALL', true);

  expect(result.success).toBe(true);
  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('removes it when the delete is asked for by directory name instead', async () => {
  // DOORMAN and the admin UI do not agree on which name they pass; both
  // must work, because both are how a sysop reaches this.
  const dir = makeTsDoor('bbslinkwall');
  const info = writeInfo('GWWALL', ['TYPE=TS', 'LOCATION=Doors/bbslinkwall', 'ACCESS=0']);

  const result = await manager.deleteDoor('bbslinkwall', true);

  expect(result.success).toBe(true);
  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('takes every command that pointed at that door, not just the first', async () => {
  const dir = makeTsDoor('bbslink');
  const first = writeInfo('BBSC', ['TYPE=TS', 'LOCATION=Doors/bbslink', 'ACCESS=0']);
  const second = writeInfo('LORD', ['TYPE=TS', 'LOCATION=Doors/bbslink', 'ACCESS=0']);

  await manager.deleteDoor('BBSC', true);

  expect(fs.existsSync(first)).toBe(false);
  expect(fs.existsSync(second)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('leaves another door alone while doing it', async () => {
  const dir = makeTsDoor('bbslinkwall');
  writeInfo('GWWALL', ['TYPE=TS', 'LOCATION=Doors/bbslinkwall', 'ACCESS=0']);
  const otherDir = makeTsDoor('keeper');
  const otherInfo = writeInfo('KEEPER', ['TYPE=TS', 'LOCATION=Doors/keeper', 'ACCESS=0']);

  await manager.deleteDoor('GWWALL', true);

  expect(fs.existsSync(dir)).toBe(false);
  expect(fs.existsSync(otherDir)).toBe(true);
  expect(fs.existsSync(otherInfo)).toBe(true);
});

it('reports failure rather than success when the registration survives', async () => {
  // The sysop's actual complaint was a delete that said it had worked. A
  // delete that cannot remove the registration must say so.
  const dir = makeTsDoor('stubborn');
  const info = writeInfo('STUBBORN', ['TYPE=TS', 'LOCATION=Doors/stubborn', 'ACCESS=0']);
  fs.chmodSync(path.join(root, 'Commands', 'BBSCmd'), 0o500);   // no unlink

  const result = await manager.deleteDoor('STUBBORN', true);

  fs.chmodSync(path.join(root, 'Commands', 'BBSCmd'), 0o700);
  expect(fs.existsSync(info)).toBe(true);
  expect(result.success).toBe(false);
  expect(result.message).toMatch(/still registered|could not/i);
  expect(fs.existsSync(dir)).toBe(false);
});
