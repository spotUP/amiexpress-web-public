/**
 * A door registered outside Commands/BBSCmd must still be deletable.
 *
 * deleteAmigaDoor built one path - Commands/BBSCmd/<CMD>.info - and answered
 * "Door command not found" when it was not there. This board carries
 * Conf3/6/7/9/11/12/13/14Cmd and Node0Cmd, and express.e resolves a command
 * from those FIRST (express.e:4630-4647: CONFCMD, then NODECMD, then BBSCMD).
 * A door registered only in one of them could be listed, could be run, and
 * could never be removed - which is how a board accumulates registrations
 * nobody can get rid of.
 *
 * The orphan scan already walked the whole Commands tree; only the lookup
 * that starts the delete did not.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AmigaDoorManager } from '../../src/doors/amigaDoorManager';

let root: string;
let manager: AmigaDoorManager;

function writeInfo(relDir: string, name: string, location: string): string {
  const dir = path.join(root, 'Commands', relDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.info`);
  fs.writeFileSync(file, `TYPE=XIM\nLOCATION=${location}\nSTACK=65536\n`);
  return file;
}

function makeDoor(name: string, binary: string): string {
  const dir = path.join(root, 'Doors', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, binary), 'binary');
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-reg-'));
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  manager = new AmigaDoorManager(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('deletes a door registered only in a conference command directory', async () => {
  // Conf12Cmd/vsys.info is real on the live board.
  const dir = makeDoor('VSYS', 'vsys');
  const info = writeInfo('Conf12Cmd', 'vsys', 'Doors:VSYS/vsys');

  const result = await manager.deleteAmigaDoor('vsys');

  expect(result.success).toBe(true);
  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('deletes a door registered only in a node command directory', async () => {
  const dir = makeDoor('NODETOOL', 'nodetool');
  const info = writeInfo('Node0Cmd', 'NT', 'Doors:NODETOOL/nodetool');

  const result = await manager.deleteAmigaDoor('NT');

  expect(result.success).toBe(true);
  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('takes the conference registration first, as express.e resolves it', async () => {
  // Two registrations of the same NAME pointing at different doors. The
  // conference one is what the command actually runs, so it is the one a
  // delete of that command must act on.
  const confDoor = makeDoor('CONFDOOR', 'confdoor');
  const globalDoor = makeDoor('GLOBALDOOR', 'globaldoor');
  const confInfo = writeInfo('Conf3Cmd', 'X', 'Doors:CONFDOOR/confdoor');
  const globalInfo = writeInfo('BBSCmd', 'X', 'Doors:GLOBALDOOR/globaldoor');

  await manager.deleteAmigaDoor('X');

  expect(fs.existsSync(confInfo)).toBe(false);
  expect(fs.existsSync(confDoor)).toBe(false);
  expect(fs.existsSync(globalInfo)).toBe(true);
  expect(fs.existsSync(globalDoor)).toBe(true);
});

it('still reports a command that is registered nowhere', async () => {
  const result = await manager.deleteAmigaDoor('NOSUCHDOOR');

  expect(result.success).toBe(false);
  expect(result.message).toContain('not found');
});
