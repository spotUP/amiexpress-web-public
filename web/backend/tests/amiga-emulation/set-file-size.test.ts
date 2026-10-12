/**
 * dos.library SetFileSize (LVO -456) truncates or extends an open file.
 *
 * It was an auto-stub (returned 0, changed nothing), and the DosLibrary method
 * behind it read the modes backwards and only knew the legacy handle table, so
 * a live door (FileManager handles) always got -1. Driven through the vector
 * table entry a door's JSR -456(A6) lands on, with the FileManager a live door
 * session uses. AutoDoc: D1 = fh, D2 = offset, D3 = mode (OFFSET_BEGINNING -1,
 * OFFSET_CURRENT 0, OFFSET_END 1); returns the new size or -1 with IoErr set;
 * a position past the new end moves to the new end.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { DOS_VECTORS } from '../../src/amiga-emulation/api/library-vectors';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

const MODE_OLDFILE = 1005;
const NAME_ADDR = 0x1000;
const BEGINNING = -1;
const CURRENT = 0;
const END = 1;

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, value: number): void { this.regs.set(reg, value | 0); }
  readMemory(addr: number): number { return this.mem.get(addr) ?? 0; }
  writeMemory(addr: number, value: number): void { this.mem.set(addr, value & 0xff); }
  readMemory16(addr: number): number { return (this.readMemory(addr) << 8) | this.readMemory(addr + 1); }
  readMemory32(addr: number): number {
    return (this.readMemory(addr) << 24) | (this.readMemory(addr + 1) << 16)
      | (this.readMemory(addr + 2) << 8) | this.readMemory(addr + 3);
  }
  writeMemory32(addr: number, value: number): void {
    for (let i = 0; i < 4; i += 1) this.writeMemory(addr + i, (value >>> (24 - 8 * i)) & 0xff);
  }
  writeMemoryBuffer(addr: number, data: Buffer): void {
    for (let i = 0; i < data.length; i += 1) this.writeMemory(addr + i, data[i]);
  }
  readLong(): number { return 0; }
  readString(addr: number, maxLen = 512): string {
    let out = '';
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      out += String.fromCharCode(byte);
    }
    return out;
  }
  writeString(addr: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) this.writeMemory(addr + i, text.charCodeAt(i));
    this.writeMemory(addr + text.length, 0);
  }
}

describe('SetFileSize (dos.library -456)', () => {
  let root: string;
  let file: string;
  let emulator: StubEmulator;
  let dos: DosLibrary;
  let fh: number;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'setfilesize-'));
    fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
    file = path.join(root, 'Conf1', 'sfs.dat');
    fs.writeFileSync(file, '0123456789');
    emulator = new StubEmulator();
    dos = new DosLibrary(emulator as never, root);
    dos.enableNewFileSystem(root);
    emulator.writeString(NAME_ADDR, 'BBS:Conf1/sfs.dat');
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, MODE_OLDFILE);
    expect(dos.handleCall(-30)).toBe(true);
    fh = emulator.getRegister(CPURegister.D0);
    expect(fh).not.toBe(0);
  });

  afterEach(() => {
    dos.handleCall(-36);
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The table entry a door's JSR -456(A6) reaches. */
  function setFileSize(offset: number, mode: number): number {
    const vector = DOS_VECTORS.find((v) => v.offset === -456);
    expect(vector?.name).toBe('SetFileSize');
    emulator.setRegister(CPURegister.D1, fh);
    emulator.setRegister(CPURegister.D2, offset);
    emulator.setRegister(CPURegister.D3, mode);
    return vector!.handler(emulator as never, dos as never) as number;
  }

  /** Seek(fh, 0, OFFSET_CURRENT) answers the previous position, i.e. the current one. */
  function position(): number {
    emulator.setRegister(CPURegister.D1, fh);
    emulator.setRegister(CPURegister.D2, 0);
    emulator.setRegister(CPURegister.D3, CURRENT);
    dos.handleCall(-66);
    return emulator.getRegister(CPURegister.D0);
  }

  test('truncates from the beginning, answers the new size, moves a position beyond the end', () => {
    emulator.setRegister(CPURegister.D1, fh);
    emulator.setRegister(CPURegister.D2, 0);
    emulator.setRegister(CPURegister.D3, END);
    dos.handleCall(-66); // Seek to the end
    expect(position()).toBe(10);

    expect(setFileSize(4, BEGINNING)).toBe(4);
    expect(fs.readFileSync(file, 'latin1')).toBe('0123');
    expect(position()).toBe(4);
  });

  test('extends from the end with zero bytes and keeps the position', () => {
    expect(setFileSize(6, END)).toBe(16);
    const bytes = fs.readFileSync(file);
    expect(bytes.length).toBe(16);
    expect(bytes.subarray(0, 10).toString('latin1')).toBe('0123456789');
    expect(bytes.subarray(10).every((b) => b === 0)).toBe(true);
    expect(position()).toBe(0);
  });

  test('OFFSET_CURRENT is relative to the handle position', () => {
    emulator.setRegister(CPURegister.D1, fh);
    emulator.setRegister(CPURegister.D2, 3);
    emulator.setRegister(CPURegister.D3, BEGINNING);
    dos.handleCall(-66);
    expect(setFileSize(2, CURRENT)).toBe(5);
    expect(fs.statSync(file).size).toBe(5);
  });

  test('answers -1 with IoErr set for a negative size, a bad mode and an unknown handle', () => {
    expect(setFileSize(-11, END)).toBe(-1);
    expect(setFileSize(1, 7)).toBe(-1);
    expect(fs.statSync(file).size).toBe(10);
    fh = 0x7fff00;
    expect(setFileSize(1, BEGINNING)).toBe(-1);
    dos.handleCall(-132);
    expect(emulator.getRegister(CPURegister.D0)).not.toBe(0);
  });
});
