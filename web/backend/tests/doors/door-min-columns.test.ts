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
  validColumns,
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

  // parseInt() read '40abc' as 40 and would have opened a door on a typo'd
  // registration. A malformed value is unclassified, and unclassified is closed.
  it('a half-numeric MIN_COLUMNS is unclassified, not 40', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '40abc' } })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '40 columns' } })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '4o' } })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '' } })).toBe(80);
  });

  it('tolerates surrounding whitespace on an otherwise numeric tooltype', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: ' 40 ' } })).toBe(40);
  });
});

describe('validColumns (shared strict parse)', () => {
  it('accepts only a whole trimmed run of digits', () => {
    expect(validColumns('40')).toBe(40);
    expect(validColumns(' 132 ')).toBe(132);
    expect(validColumns(40)).toBe(40);
    expect(validColumns('40abc')).toBeNull();
    expect(validColumns('-5')).toBeNull();
    expect(validColumns('0')).toBeNull();
    expect(validColumns(40.5)).toBeNull();
    expect(validColumns(undefined)).toBeNull();
    expect(validColumns(null)).toBeNull();
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
  it('a genuinely wide terminal reports its real width, so it can satisfy MIN_COLUMNS above 80', () => {
    expect(sessionColumns({ screenWidth: 132 })).toBe(132);
    expect(sessionColumns({ screenWidth: 200, petsciiMode: false })).toBe(200);
  });
  it('a wide PETSCII session is still 40 - a C64 has no other width', () => {
    expect(sessionColumns({ petsciiMode: true, screenWidth: 132 })).toBe(40);
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

  // Same strict rule as the resolver: the .info parse must not turn '40abc'
  // into a 40 that opens the door.
  it('refuses a half-numeric MIN_COLUMNS in a .info, leaving the door closed', () => {
    const { getAmigaDoorManager } = require('../../src/doors/amigaDoorManager');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-mincol-'));
    const infoPath = path.join(root, 'TYPODOOR.info');
    fs.writeFileSync(infoPath, 'LOCATION=Doors:TypoDoor/TypoDoor\nACCESS=10\nTYPE=XIM\nMIN_COLUMNS=40abc\n');
    const meta = getAmigaDoorManager().parseInfoFile(infoPath);
    expect(meta?.minColumns).toBeUndefined();
    expect(resolveDoorMinColumns({ command: 'TYPODOOR', doorInfo: meta as any })).toBe(80);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

/**
 * C64_ADAPT resolver + the one adapter predicate (Phase 3 Task 5).
 *
 * MIN_COLUMNS=40 says "this door already fits 40". C64_ADAPT=<columns> says
 * something different - "this door reaches N columns THROUGH the adapter" -
 * so the two are separate declarations parsed by the SAME validColumns, and
 * absent still means unclassified, which stays closed.
 *
 * doorOpensForC64 is the ONE predicate: the launch gate asks it whether a
 * gated door may still open, and executeAmigaDoor asks it whether to install
 * the adapter. They can never disagree because there is only one answer.
 */
describe('resolveDoorAdaptColumns', () => {
  const { resolveDoorAdaptColumns } = require('../../src/utils/door-min-columns.util');

  it('is null when nothing declares C64_ADAPT (default-closed)', () => {
    expect(resolveDoorAdaptColumns({ command: 'X' })).toBeNull();
    expect(resolveDoorAdaptColumns({ command: 'X', toolTypes: { ACCESS: '10' } })).toBeNull();
  });

  it('is null for MIN_COLUMNS alone - a different promise, not this one', () => {
    expect(resolveDoorAdaptColumns({ command: 'X', minColumns: 40, toolTypes: { MIN_COLUMNS: '40' } })).toBeNull();
  });

  it('reads the BBSCMD tooltype, the installed record tooltype and the folded field', () => {
    expect(resolveDoorAdaptColumns({ toolTypes: { C64_ADAPT: '40' } })).toBe(40);
    expect(resolveDoorAdaptColumns({ doorInfo: { toolTypes: { C64_ADAPT: '40' } } })).toBe(40);
    expect(resolveDoorAdaptColumns({ c64Adapt: 40 })).toBe(40);
  });

  it('applies the strict shared parser - a non-numeric claim is unclassified', () => {
    for (const bad of ['yes', 'YES', '-1', '0', '40abc', '', ' ']) {
      expect(resolveDoorAdaptColumns({ toolTypes: { C64_ADAPT: bad } })).toBeNull();
    }
  });
});

describe('doorOpensForC64', () => {
  const { doorOpensForC64 } = require('../../src/utils/door-min-columns.util');
  const c64 = { petsciiMode: true, screenWidth: 40 };
  const ansi = { petsciiMode: false, screenWidth: 80 };

  it('is true for a marked 68K door on a PETSCII session at a width it claims', () => {
    // 'AMI' was in this list until 2026-09-03 and never matched a real door:
    // DoorType spells the AREXX type 'AIM', so the member was a dead string
    // and this case was asserting a type nothing on the board can have. The
    // string is gone from ADAPTED_DOOR_TYPES; the AREXX refusal is asserted in
    // the type case below and pinned in tests/doors/adapted-door-types.test.ts.
    for (const type of ['XIM', 'DD', 'SIM', 'FIM', 'xim', 'dd']) {
      expect(doorOpensForC64({ type, toolTypes: { C64_ADAPT: '40' } }, c64)).toBe(true);
    }
  });

  it('is false for an unmarked door of the same type', () => {
    expect(doorOpensForC64({ type: 'XIM' }, c64)).toBe(false);
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { MIN_COLUMNS: '40' } }, c64)).toBe(false);
  });

  it('is false for a non-PETSCII session - 80-column callers never get the adapter', () => {
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '40' } }, ansi)).toBe(false);
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '40' } }, undefined)).toBe(false);
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '40' } }, { petsciiMode: false, screenWidth: 40 })).toBe(false);
  });

  it('is false for door types that never reach the adapter seam', () => {
    // 'AIM' and 'AMI' are both here on purpose: the real AREXX spelling, and
    // the typo that used to look like it covered AREXX.
    for (const type of ['TS', 'typescript', 'AREXX', 'AIM', 'AMI', 'MCI', 'WEB', 'python', undefined]) {
      expect(doorOpensForC64({ type, toolTypes: { C64_ADAPT: '40' } } as any, c64)).toBe(false);
    }
  });

  it('is false when the door claims more columns than the caller has', () => {
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '64' } }, c64)).toBe(false);
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '40' } }, c64)).toBe(true);
  });
});
