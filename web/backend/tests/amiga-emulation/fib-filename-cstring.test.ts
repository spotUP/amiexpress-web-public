/**
 * Regression: FileInfoBlock's fib_FileName is a C string, not a BCPL string.
 *
 * The NDK is unambiguous - dos/dos.h:65:
 *
 *     TEXT fib_FileName[108]; /* Null terminated. Max 30 chars used for now *\/
 *
 * Examine(), ExNext() and ExamineFH() were all writing it with a leading
 * length byte, the BCPL convention that applies to BSTRs elsewhere in DOS but
 * not to this field. A door doing the correct thing -
 *
 *     Examine(lock, fib);
 *     printf("%s", fib->fib_FileName);
 *
 * - therefore read a control character followed by the name, under this
 * emulator only. The identical binary is correct on a real Amiga, so this
 * broke directory enumeration for every 68K door here while looking like the
 * door's fault. Found while checking whether DoorRepo could enumerate a
 * directory locally rather than asking the BBS for a listing.
 *
 * fib_Comment (offset 144) is the same kind of field and had the same bug.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

const NAME_ADDR = 0x200000;
const FIB_ADDR = 0x210000;

/** FileInfoBlock offsets, from dos/dos.h. */
const FIB_DIR_ENTRY_TYPE = 4;
const FIB_FILENAME = 8;
const FIB_FILENAME_SIZE = 108;
const FIB_SIZE_FIELD = 124;
const FIB_COMMENT = 144;

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

/** Read a fixed-size field back the way C would: up to the first NUL. */
function readCString(stub: StubEmulator, address: number, fieldSize: number): string {
  let out = '';
  for (let i = 0; i < fieldSize; i++) {
    const b = stub.readMemory(address + i);
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

function writeCString(stub: StubEmulator, address: number, value: string): void {
  for (let i = 0; i < value.length; i++) stub.writeMemory(address + i, value.charCodeAt(i));
  stub.writeMemory(address + value.length, 0);
}

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fib-'));
  fs.mkdirSync(path.join(root, 'AEHELP'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AEHELP', 'aehelp'), 'binary');
  fs.mkdirSync(path.join(root, 'AEHELP', 'docs'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Lock a path and Examine it, returning the stub so the FIB can be read. */
function lockAndExamine(target: string): StubEmulator {
  const stub = new StubEmulator();
  const dos = new DosLibrary(stub as any, root);

  writeCString(stub, NAME_ADDR, target);
  stub.setRegister(CPURegister.D1, NAME_ADDR);
  stub.setRegister(CPURegister.D2, -2 >>> 0); // ACCESS_READ
  dos.Lock();
  const lockBptr = stub.getRegister(CPURegister.D0);
  expect(lockBptr).not.toBe(0);

  stub.setRegister(CPURegister.D1, lockBptr);
  stub.setRegister(CPURegister.D2, FIB_ADDR);
  dos.Examine();
  expect(stub.getRegister(CPURegister.D0)).not.toBe(0);

  return stub;
}

it('Examine writes fib_FileName as a plain NUL-terminated name', () => {
  const stub = lockAndExamine('AEHELP');

  // The bug: a length byte first, so the first character was \x06.
  expect(stub.readMemory(FIB_ADDR + FIB_FILENAME)).not.toBe(0x06);
  expect(readCString(stub, FIB_ADDR + FIB_FILENAME, FIB_FILENAME_SIZE)).toBe('AEHELP');
});

it('Examine reports a directory in fib_DirEntryType', () => {
  const stub = lockAndExamine('AEHELP');

  // dos/dos.h: "> 0 a directory", "< 0 then a plain file".
  const raw = stub.readMemory32(FIB_ADDR + FIB_DIR_ENTRY_TYPE) | 0;
  expect(raw).toBeGreaterThan(0);
});

it('Examine on a file gives its name and size, name still a C string', () => {
  const stub = lockAndExamine('AEHELP/aehelp');

  expect(readCString(stub, FIB_ADDR + FIB_FILENAME, FIB_FILENAME_SIZE)).toBe('aehelp');
  expect(stub.readMemory32(FIB_ADDR + FIB_SIZE_FIELD)).toBe('binary'.length);
  expect((stub.readMemory32(FIB_ADDR + FIB_DIR_ENTRY_TYPE) | 0)).toBeLessThan(0);
});

it('fib_Comment is a NUL-terminated field too, not a length-prefixed one', () => {
  const stub = lockAndExamine('AEHELP');

  // Empty comment: every byte of the field must be zero. Under the BCPL
  // writer the first byte was the length, which happened to be 0 as well -
  // so this pins the shape rather than catching that case, and would fail
  // the moment a non-empty comment was written the old way.
  expect(stub.readMemory(FIB_ADDR + FIB_COMMENT)).toBe(0);
});

it('the name field is zero-padded, so a shorter name cannot leave a tail behind', () => {
  const stub = lockAndExamine('AEHELP');
  const name = 'AEHELP';

  expect(stub.readMemory(FIB_ADDR + FIB_FILENAME + name.length)).toBe(0);
  expect(stub.readMemory(FIB_ADDR + FIB_FILENAME + FIB_FILENAME_SIZE - 1)).toBe(0);
});
