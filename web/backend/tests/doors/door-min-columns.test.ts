/**
 * MIN_COLUMNS resolver unit tests (C64/40-col plan, Task 1).
 *
 * The gate itself is exercised through the real executeDoor entry point in
 * door-min-columns-gate.test.ts; this file pins the pure resolution rules
 * the gate depends on, above all the DEFAULT-CLOSED rule: a door with no
 * MIN_COLUMNS anywhere resolves to 80 and is therefore unreachable from a
 * 40-column session until somebody marks it explicitly.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  resolveDoorMinColumns,
  sessionColumns,
  DOOR_NEEDS_80_NOTICE,
} from '../../src/utils/door-min-columns.util';

describe('resolveDoorMinColumns', () => {
  it('defaults to 80 when no MIN_COLUMNS exists anywhere (default-closed)', () => {
    expect(resolveDoorMinColumns({ command: 'NOSUCH', id: 'nosuch' })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { ACCESS: '10' } })).toBe(80);
  });

  it('honors an explicit minColumns field from the registry', () => {
    expect(resolveDoorMinColumns({ command: 'X', minColumns: 40 })).toBe(40);
  });

  it('reads MIN_COLUMNS from the BBSCMD tooltype map (initializeDoors pass-through)', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '40' } })).toBe(40);
  });

  it('reads MIN_COLUMNS from an installed 68K door record (displayDoorMenu doorInfo)', () => {
    expect(resolveDoorMinColumns({ command: 'X', doorInfo: { minColumns: 40 } })).toBe(40);
    expect(resolveDoorMinColumns({ command: 'X', doorInfo: { toolTypes: { MIN_COLUMNS: '40' } } })).toBe(40);
  });

  it('a door can demand MORE than 80', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '132' } })).toBe(132);
  });

  it('garbage MIN_COLUMNS values fall back to 80, never NaN', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: 'lots' } })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '-5' } })).toBe(80);
  });
});

describe('sessionColumns', () => {
  it('reads a PETSCII session screenWidth when set', () => {
    expect(sessionColumns({ petsciiMode: true, screenWidth: 40 })).toBe(40);
    expect(sessionColumns({ petsciiMode: true, screenWidth: 80 })).toBe(40);
  });
  it('petsciiMode with no width recorded is 40, never 80', () => {
    expect(sessionColumns({ petsciiMode: true })).toBe(40);
  });
  it('a bare session is 80 (legacy behavior unchanged)', () => {
    expect(sessionColumns({})).toBe(80);
  });
  // Non-negotiable: 80-column output for non-C64 platforms is NEVER degraded.
  // socket-handlers.ts writes a real xterm width onto every ordinary web
  // session, so a phone in portrait carries screenWidth well under 80. Only
  // petsciiMode may make a session narrow - the same rule doorScreenWidth()
  // and wrapForSession already enforce.
  it('a narrow NON-PETSCII terminal is still 80 (a phone is not a C64)', () => {
    expect(sessionColumns({ screenWidth: 40 })).toBe(80);
    expect(sessionColumns({ screenWidth: 32, petsciiMode: false })).toBe(80);
  });
});

describe('DOOR_NEEDS_80_NOTICE', () => {
  it('is uppercase-only ASCII with CRLF framing (C64-legible)', () => {
    expect(DOOR_NEEDS_80_NOTICE).toBe('\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n');
    expect(/^[\r\n A-Z0-9]+$/.test(DOOR_NEEDS_80_NOTICE)).toBe(true);
  });
});

describe('amigaDoorManager MIN_COLUMNS parsing', () => {
  it('parses MIN_COLUMNS from a door .info into DoorInfo.minColumns', () => {
    const { getAmigaDoorManager } = require('../../src/doors/amigaDoorManager');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-mincol-'));
    const infoPath = path.join(root, 'TESTDOOR.info');
    fs.writeFileSync(infoPath, 'LOCATION=Doors:TestDoor/TestDoor\nACCESS=10\nTYPE=XIM\nMIN_COLUMNS=40\n');
    const meta = getAmigaDoorManager().parseInfoFile(infoPath);
    expect(meta?.minColumns).toBe(40);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('leaves minColumns undefined when the .info carries no MIN_COLUMNS (unclassified = closed)', () => {
    const { getAmigaDoorManager } = require('../../src/doors/amigaDoorManager');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-mincol-'));
    const infoPath = path.join(root, 'PLAINDOOR.info');
    fs.writeFileSync(infoPath, 'LOCATION=Doors:PlainDoor/PlainDoor\nACCESS=10\nTYPE=XIM\n');
    const meta = getAmigaDoorManager().parseInfoFile(infoPath);
    expect(meta?.minColumns).toBeUndefined();
    expect(resolveDoorMinColumns({ command: 'PLAINDOOR', doorInfo: meta as any })).toBe(80);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
