/**
 * A process's current directory is its Process's pr_CurrentDir: a lock from
 * dos.library's lock table, which CurrentDir() swaps and hands back as given.
 *
 * Two measured symptoms (2026-10-12):
 *  - LhA, run by mULTI-cHECK, ends by CurrentDir()-ing back to the directory
 *    it started in, read from pr_CurrentDir. That was DoorLoader's fabricated
 *    lock at 0xa0200, unknown to dos.library: "CurrentDir: Invalid lock BPTR
 *    163968".
 *  - File Description CurrentDir()s to BBS:Node1/Work/ and runs
 *    "Unzip -o <zip> file_id.diz"; CurrentDir changed a path string the name
 *    resolver never read, so file_id.diz landed in the door's own directory
 *    and the door, reading Work/, said "Not Found!".
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DosLibrary, type ProcessExec } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, val: number): void { this.regs.set(reg, val >>> 0); }
  readMemory(addr: number): number { return this.mem.get(addr >>> 0) ?? 0; }
  writeMemory(addr: number, byte: number): void { this.mem.set(addr >>> 0, byte & 0xff); }
  readMemory32(addr: number): number {
    return ((this.readMemory(addr) << 24) | (this.readMemory(addr + 1) << 16) |
      (this.readMemory(addr + 2) << 8) | this.readMemory(addr + 3)) >>> 0;
  }
  writeMemory32(addr: number, val: number): void {
    for (let i = 0; i < 4; i++) this.writeMemory(addr + i, (val >>> (24 - 8 * i)) & 0xff);
  }
  readMemory16(addr: number): number { return ((this.readMemory(addr) << 8) | this.readMemory(addr + 1)) & 0xffff; }
  writeMemory16(addr: number, val: number): void {
    this.writeMemory(addr, (val >> 8) & 0xff);
    this.writeMemory(addr + 1, val & 0xff);
  }
  writeString(addr: number, s: string): void {
    for (let i = 0; i < s.length; i++) this.writeMemory(addr + i, s.charCodeAt(i));
    this.writeMemory(addr + s.length, 0);
  }
}

const TASK = 0x8000;
const PR_CURRENT_DIR = 0x98;
const NAME = 0x9000;
const MODE_NEWFILE = 1006;

function attachedDos() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-dir-'));
  fs.mkdirSync(path.join(root, 'Node1', 'Work'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'FileDescription'), { recursive: true });
  const emu = new StubEmulator();
  const dos = new DosLibrary(emu as never, root);
  let heap = 0x100000;
  const exec: ProcessExec = {
    allocMem: (size) => { const a = heap; heap += (size + 3) & ~3; return a; },
    freeMem: () => undefined,
    getCurrentTaskAddress: () => TASK,
    setStackBounds: () => undefined,
    getStackLower: () => 0,
    getStackUpper: () => 0,
  };
  dos.setExecLibrary(exec);
  dos.enableNewFileSystem(root);
  dos.setDoorDirectory(path.join(root, 'Doors', 'FileDescription'));

  const lock = (name: string): number => {
    emu.writeString(NAME, name);
    emu.setRegister(CPURegister.D1, NAME);
    emu.setRegister(CPURegister.D2, 0xfffffffe); // ACCESS_READ
    dos.Lock();
    return emu.getRegister(CPURegister.D0);
  };
  const currentDir = (bptr: number): number => {
    emu.setRegister(CPURegister.D1, bptr);
    dos.CurrentDir();
    return emu.getRegister(CPURegister.D0);
  };
  const open = (name: string, mode: number): number => {
    emu.writeString(NAME, name);
    emu.setRegister(CPURegister.D1, NAME);
    emu.setRegister(CPURegister.D2, mode);
    return dos.Open();
  };
  return { root, emu, dos, lock, currentDir, open };
}

describe('the current directory is pr_CurrentDir, a dos.library lock', () => {
  it('UnZip run after CurrentDir(Work/) writes file_id.diz into Work/, not the door directory', () => {
    const { root, emu, lock, currentDir, open } = attachedDos();
    const work = lock('BBS:Node1/Work/');
    expect(work).not.toBe(0);
    currentDir(work);
    expect(emu.readMemory32(TASK + PR_CURRENT_DIR)).toBe(work);

    expect(open('file_id.diz', MODE_NEWFILE)).not.toBe(0);
    expect(fs.existsSync(path.join(root, 'Node1', 'Work', 'file_id.diz'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Doors', 'FileDescription', 'file_id.diz'))).toBe(false);
    // A relative Lock lands there too.
    expect(lock('file_id.diz')).not.toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CurrentDir hands back the very lock the process started in, so LhA can return to it', () => {
    const { root, emu, lock, currentDir } = attachedDos();
    const start = lock('BBS:');
    const work = lock('BBS:Node1/Work/');
    emu.writeMemory32(TASK + PR_CURRENT_DIR, start); // how a Process starts
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(currentDir(work)).toBe(start);
    // LhA's exit: back to the directory it read from pr_CurrentDir.
    expect(currentDir(start)).toBe(work);
    expect(emu.readMemory32(TASK + PR_CURRENT_DIR)).toBe(start);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Invalid lock/);
    errors.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
