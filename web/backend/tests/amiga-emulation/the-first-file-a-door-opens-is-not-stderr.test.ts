/**
 * Regression: the first file a door opens is not examined as stderr.
 *
 * FileManager handed out BPTR 3 first - the id of STDERR_HANDLE - and
 * ExamineFH looked handles up in DosLibrary.openFiles, where 3 is STDERR. A
 * door that opened one file and called ExamineFH on it got stderr's record
 * (no such file); every later handle was absent from that table entirely.
 * One handle table now: reserved ids are never allocated, and the by-name
 * lookups (ExamineFH, NameFromFH, DupLockFromFH, ParentOfFH) go through the
 * table that owns the handle.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { RESERVED_HANDLES, STDERR_HANDLE } from '../../src/amiga-emulation/api/dos/dos-types';

const NAME_ADDR = 0x200000;
const FIB_ADDR = 0x210000;
const FIB_SIZE_FIELD = 124;

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();

  getRegister(reg: number): number {
    return this.regs.get(reg) ?? 0;
  }
  setRegister(reg: number, value: number): void {
    this.regs.set(reg, value >>> 0);
  }
  writeMemory(address: number, byte: number): void {
    this.mem.set(address >>> 0, byte & 0xff);
  }
  readMemory(address: number): number {
    return this.mem.get(address >>> 0) ?? 0;
  }
  getMemoryByte(address: number): number {
    return this.readMemory(address);
  }
  writeMemory32(address: number, value: number): void {
    this.writeMemory(address, (value >>> 24) & 0xff);
    this.writeMemory(address + 1, (value >>> 16) & 0xff);
    this.writeMemory(address + 2, (value >>> 8) & 0xff);
    this.writeMemory(address + 3, value & 0xff);
  }
  readMemory32(address: number): number {
    return (
      ((this.readMemory(address) << 24) |
        (this.readMemory(address + 1) << 16) |
        (this.readMemory(address + 2) << 8) |
        this.readMemory(address + 3)) >>> 0
    );
  }
}


function writeCString(stub: StubEmulator, address: number, value: string): void {
  for (let i = 0; i < value.length; i++) stub.writeMemory(address + i, value.charCodeAt(i));
  stub.writeMemory(address + value.length, 0);
}

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'hello');
  fs.writeFileSync(path.join(root, 'b.txt'), 'twelve bytes');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function open(stub: StubEmulator, dos: DosLibrary, name: string): number {
  writeCString(stub, NAME_ADDR, name);
  stub.setRegister(CPURegister.D1, NAME_ADDR);
  stub.setRegister(CPURegister.D2, 1005);
  return dos.Open();
}

function examineFH(stub: StubEmulator, dos: DosLibrary, fh: number): number {
  stub.setRegister(CPURegister.D1, fh);
  stub.setRegister(CPURegister.D2, FIB_ADDR);
  dos.ExamineFH();
  return stub.getRegister(CPURegister.D0);
}

function session(): { stub: StubEmulator; dos: DosLibrary } {
  const stub = new StubEmulator();
  const dos = new DosLibrary(stub as any, root);
  dos.enableNewFileSystem(root);
  return { stub, dos };
}

it('the first file a door opens is not examined as stderr', () => {
  const { stub, dos } = session();
  const fh = open(stub, dos, 'bbs:a.txt');
  expect(fh).not.toBe(0);
  expect(fh).not.toBe(STDERR_HANDLE);
  expect(examineFH(stub, dos, fh)).not.toBe(0);
  expect(stub.readMemory32(FIB_ADDR + FIB_SIZE_FIELD)).toBe(5);
});

it('every open file is examined as itself, not only the first', () => {
  const { stub, dos } = session();
  const a = open(stub, dos, 'bbs:a.txt');
  const b = open(stub, dos, 'bbs:b.txt');
  expect(examineFH(stub, dos, b)).not.toBe(0);
  expect(stub.readMemory32(FIB_ADDR + FIB_SIZE_FIELD)).toBe(12);
  expect(examineFH(stub, dos, a)).not.toBe(0);
  expect(stub.readMemory32(FIB_ADDR + FIB_SIZE_FIELD)).toBe(5);
});

it('a reserved handle is never handed out, and an unknown one is still refused', () => {
  const { stub, dos } = session();
  for (let i = 0; i < 120; i++) {
    const fh = open(stub, dos, i % 2 ? 'bbs:a.txt' : 'bbs:b.txt');
    expect(fh).toBeGreaterThan(0);
    expect(RESERVED_HANDLES.has(fh)).toBe(false);
  }
  expect(examineFH(stub, dos, 5000)).toBe(0);
});
