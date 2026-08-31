/**
 * Deleting one door must not take its neighbours with it.
 *
 * Reported live on 2026-08-31: after the sysop deleted doors in DOORMAN, seven
 * command registrations were gone from Commands/BBSCmd - J, B, BESTCONF,
 * AVAIL, AVHBC, ADDBBS, 5DPAGER - and six of them belonged to doors whose
 * directories were still on the volume. J fell through to the BBS's internal
 * Join Conference; B answered nothing at all.
 *
 * Two defects, both in what `deleteAmigaDoor` treated as "the door's
 * directory":
 *
 *   1. A SHARED directory. Doors/emp_tools holds two unrelated doors -
 *      Joincnf (registered as J) and Bulls (registered as B). The delete took
 *      dirname(LOCATION) as the door's own directory, removed it whole, and
 *      removed every registration pointing into it. Deleting either door
 *      deleted both.
 *
 *   2. A LOCATION that names a DIRECTORY rather than a file - BestConf is
 *      LOCATION=Doors:BestConf. dirname() of that is Doors/ itself, so every
 *      registration on the board "pointed into the door directory" and the
 *      directory queued for removal was the whole Doors/ tree. The 2026-08-30
 *      containment guard stops the tree being removed; it does not stop the
 *      registrations being removed.
 *
 * The rule these tests fix in place: a door owns its own FILE. The directory
 * around it belongs to the door only when nothing else claims anything in it.
 * A registration resolving to the SAME file is an alias of this door (5D-LogOff
 * is registered as G) and goes with it; a registration resolving to a
 * DIFFERENT file in the same directory is another door and stays.
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

/** A directory under Doors/ holding one or more door binaries. */
function makeDoorDir(name: string, binaries: string[]): string {
  const dir = path.join(root, 'Doors', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const binary of binaries) fs.writeFileSync(path.join(dir, binary), 'binary');
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-door-'));
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  manager = new AmigaDoorManager(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('deleting Joincnf leaves Bulls and its registration in the shared directory', async () => {
  const dir = makeDoorDir('emp_tools', ['Joincnf', 'Bulls']);
  const j = writeInfo('BBSCmd', 'J', 'Doors:emp_tools/Joincnf');
  const b = writeInfo('BBSCmd', 'B', 'DOORS:EmP_Tools/Bulls');

  const result = await manager.deleteAmigaDoor('J');

  expect(result.success).toBe(true);
  expect(fs.existsSync(j)).toBe(false);
  expect(fs.existsSync(path.join(dir, 'Joincnf'))).toBe(false);

  // The neighbour, untouched - registration, binary and the directory itself.
  expect(fs.existsSync(b)).toBe(true);
  expect(fs.existsSync(path.join(dir, 'Bulls'))).toBe(true);
  expect(fs.existsSync(dir)).toBe(true);
});

it('says the directory was kept and who else is in it', async () => {
  makeDoorDir('emp_tools', ['Joincnf', 'Bulls']);
  writeInfo('BBSCmd', 'J', 'Doors:emp_tools/Joincnf');
  writeInfo('BBSCmd', 'B', 'Doors:emp_tools/Bulls');

  const steps: string[] = [];
  await manager.deleteAmigaDoor('J', (step) => steps.push(step.text));

  const line = steps.find((t) => t.includes('emp_tools') && /kept|shared/i.test(t));
  expect(line).toBeDefined();
  expect(line).toContain('B');
});

it('still removes an alias - the same binary registered under a second name', async () => {
  // 5D-LogOff is registered as G. Two names, one file: both go.
  const dir = makeDoorDir('emp_tools', ['Joincnf', 'Bulls']);
  const j = writeInfo('BBSCmd', 'J', 'Doors:emp_tools/Joincnf');
  const join = writeInfo('Conf12Cmd', 'JOIN', 'Doors:emp_tools/Joincnf');
  const b = writeInfo('BBSCmd', 'B', 'Doors:emp_tools/Bulls');

  await manager.deleteAmigaDoor('J');

  expect(fs.existsSync(j)).toBe(false);
  expect(fs.existsSync(join)).toBe(false);
  expect(fs.existsSync(b)).toBe(true);
  expect(fs.existsSync(path.join(dir, 'Bulls'))).toBe(true);
});

it('a LOCATION naming a door directory deletes that directory, not Doors/', async () => {
  // BestConf's registration is LOCATION=Doors:BestConf - the directory
  // itself. dirname() of that is Doors/, which is every door on the board.
  const bestconf = makeDoorDir('BestConf', ['BestConf.XIM']);
  const other = makeDoorDir('KEEPER', ['keeper']);
  const info = writeInfo('BBSCmd', 'BESTCONF', 'Doors:BestConf');
  const keeper = writeInfo('BBSCmd', 'KEEPER', 'Doors:KEEPER/keeper');

  const result = await manager.deleteAmigaDoor('BESTCONF');

  expect(result.success).toBe(true);
  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(bestconf)).toBe(false);

  // Everything else on the board survives, Doors/ included.
  expect(fs.existsSync(path.join(root, 'Doors'))).toBe(true);
  expect(fs.existsSync(other)).toBe(true);
  expect(fs.existsSync(keeper)).toBe(true);
});

it('a LOCATION pointing at a vanished door removes only its registration', async () => {
  // The shape left behind by an earlier half-delete: the .info is there and
  // the door is not. dirname() climbs to Doors/, so this is the case that
  // could take every registration with it.
  const other = makeDoorDir('KEEPER', ['keeper']);
  const info = writeInfo('BBSCmd', 'GONE', 'Doors:GoneDoor');
  const keeper = writeInfo('BBSCmd', 'KEEPER', 'Doors:KEEPER/keeper');

  await manager.deleteAmigaDoor('GONE');

  expect(fs.existsSync(info)).toBe(false);
  expect(fs.existsSync(keeper)).toBe(true);
  expect(fs.existsSync(other)).toBe(true);
  expect(fs.existsSync(path.join(root, 'Doors'))).toBe(true);
});

it('deletes the directory when the door is the only thing in it', async () => {
  // The ordinary case must not become timid: one door, one directory, gone.
  const dir = makeDoorDir('5D-LogOff', ['5D-LogOff']);
  const g = writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');

  await manager.deleteAmigaDoor('G');

  expect(fs.existsSync(g)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});
