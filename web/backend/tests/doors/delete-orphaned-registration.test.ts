/**
 * Regression: a door is not always registered under its own name.
 *
 * 5D-LogOff is registered as G - Commands/BBSCmd/G.info with
 * LOCATION=Doors:5D-LogOff/5D-LogOff. Deleting the door looked for
 * Commands/BBSCmd/5D-LogOff.info, found nothing, and left G.info behind
 * pointing at a directory that no longer existed.
 *
 * On the live board that orphan shadowed the INTERNAL goodbye command: typing
 * G answered "Door executable not found" and there was no way to log off. The
 * same shape is recorded in the parity spec as the DD failure - "the door lost
 * its files and kept its name, because the .info IS the registration every
 * door list is built from".
 *
 * The scan covers the whole Commands tree, not just BBSCmd: this board also
 * carries Conf3/6/7/9/11/12/13/14Cmd and Node0Cmd, and a registration in any
 * of them keeps a deleted door alive just as well.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AmigaDoorManager } from '../../src/doors/amigaDoorManager';

let root: string;
let manager: AmigaDoorManager;

/** A registration whose LOCATION points at `location`. */
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-'));
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  manager = new AmigaDoorManager(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('finds a registration named differently from the door it points at', () => {
  const dir = makeDoor('5D-LogOff', '5D-LogOff');
  const g = writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');

  const found = manager.findRegistrationsPointingInto(dir);

  expect(found.map((f) => path.basename(f))).toContain('G.info');
  expect(found).toContain(g);
});

it('finds one in a conference command directory, not just BBSCmd', () => {
  // Conf12Cmd/vsys.info is real on the live board.
  const dir = makeDoor('VSYS', 'vsys');
  writeInfo('Conf12Cmd', 'vsys', 'Doors:VSYS/vsys');

  const found = manager.findRegistrationsPointingInto(dir);

  expect(found.map((f) => path.basename(f))).toContain('vsys.info');
});

it('ignores a registration pointing at a different door', () => {
  const keep = makeDoor('KEEPER', 'keeper');
  makeDoor('5D-LogOff', '5D-LogOff');
  writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');

  const found = manager.findRegistrationsPointingInto(keep);

  expect(found).toEqual([]);
});

it('does not match a door whose name merely starts the same', () => {
  // Doors/CALC and Doors/CALCULATOR are different doors; a prefix compare
  // would delete the second's registration along with the first.
  const calc = makeDoor('CALC', 'calc');
  makeDoor('CALCULATOR', 'calculator');
  writeInfo('BBSCmd', 'CALCULATOR', 'Doors:CALCULATOR/calculator');

  const found = manager.findRegistrationsPointingInto(calc);

  expect(found).toEqual([]);
});

it('matches a registration pointing deep inside the door directory', () => {
  // The CALC install wrote LOCATION=Doors:CALC/VCLCALC/DOORS/CALCULATOR/CALC.rexx
  const dir = makeDoor('CALC', 'placeholder');
  fs.mkdirSync(path.join(dir, 'VCLCALC', 'DOORS', 'CALCULATOR'), { recursive: true });
  writeInfo('BBSCmd', 'CALC', 'Doors:CALC/VCLCALC/DOORS/CALCULATOR/CALC.rexx');

  const found = manager.findRegistrationsPointingInto(dir);

  expect(found.map((f) => path.basename(f))).toContain('CALC.info');
});

it('survives a Commands tree with unreadable entries', () => {
  const dir = makeDoor('5D-LogOff', '5D-LogOff');
  writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');
  // A file that is not an .info, and one that is but holds nothing usable.
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'notes.txt'), 'x');
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'broken.info'), '');

  const found = manager.findRegistrationsPointingInto(dir);

  expect(found.map((f) => path.basename(f))).toEqual(['G.info']);
});

it('returns nothing when the Commands tree is absent', () => {
  const dir = makeDoor('LONE', 'lone');

  expect(manager.findRegistrationsPointingInto(dir)).toEqual([]);
});

it('deleting one command removes every other registration for the same door', async () => {
  // The requirement, stated by the sysop: "if i delete a door that uses
  // G.info, G.info should also be deleted for a proper uninstall". A door
  // registered under two commands used to leave the second behind, still
  // answering, pointing at files that were gone.
  const dir = makeDoor('5D-LogOff', '5D-LogOff');
  const g = writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');
  const bye = writeInfo('BBSCmd', 'BYE', 'Doors:5D-LogOff/5D-LogOff');

  const result = await manager.deleteAmigaDoor('BYE');

  expect(result.success).toBe(true);
  expect(fs.existsSync(bye)).toBe(false);
  expect(fs.existsSync(g)).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
});

it('leaves another door\'s registration alone while doing it', async () => {
  const dir = makeDoor('5D-LogOff', '5D-LogOff');
  writeInfo('BBSCmd', 'G', 'Doors:5D-LogOff/5D-LogOff');
  const keeperDir = makeDoor('KEEPER', 'keeper');
  const keeper = writeInfo('BBSCmd', 'KEEPER', 'Doors:KEEPER/keeper');

  await manager.deleteAmigaDoor('G');

  expect(fs.existsSync(keeper)).toBe(true);
  expect(fs.existsSync(keeperDir)).toBe(true);
  expect(fs.existsSync(dir)).toBe(false);
});
