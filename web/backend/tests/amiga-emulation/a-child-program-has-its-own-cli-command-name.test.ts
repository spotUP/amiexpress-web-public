/**
 * A program started by Execute / SystemTagList has its own cli_CommandName;
 * RunCommand leaves it alone. On AmigaOS the shell stores the command it starts in the
 * CLI's cli_CommandName BSTR; 01a96fb91 gave GetProgramName the right name for
 * a child but the CLI struct still held the parent's, so a program that reads
 * pr_CLI->cli_CommandName itself (as most C startup code and GetProgramName's
 * own implementation do) saw the wrong command.
 *
 * The BSTR comes from AllocMem (the one memory map), and the parent's BPTR is
 * back when the child returns. Driven through DosLibrary's child start/return
 * (the same startChild every one of the three entry points uses); the real
 * emulator end of it is a-checker-runs-the-real-archiver (LhA via System()).
 */
import { DosLibrary } from "../../src/amiga-emulation/api/DosLibrary";

class Mem {
  mem = new Map<number, number>();
  regs = new Map<number, number>();
  getRegister(r: number) { return this.regs.get(r) ?? 0; }
  setRegister(r: number, v: number) { this.regs.set(r, v >>> 0); }
  readMemory(a: number) { return this.mem.get(a >>> 0) ?? 0; }
  writeMemory(a: number, b: number) { this.mem.set(a >>> 0, b & 0xff); }
  readMemory32(a: number) {
    return ((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) | (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0;
  }
  writeMemory32(a: number, v: number) {
    for (let i = 0; i < 4; i++) this.writeMemory(a + i, (v >>> (24 - 8 * i)) & 0xff);
  }
  bstr(bptr: number) {
    const a = bptr << 2; let s = "";
    for (let i = 0; i < this.readMemory(a); i++) s += String.fromCharCode(this.readMemory(a + 1 + i));
    return s;
  }
}

const TASK = 0x1000, CLI = 0x2000, PARENT_NAME = 0x2100;

function setup() {
  const emu = new Mem();
  emu.writeMemory32(TASK + 0xac, CLI >> 2);          // pr_CLI
  emu.writeMemory(PARENT_NAME, 4);
  "DOOR".split("").forEach((c, i) => emu.writeMemory(PARENT_NAME + 1 + i, c.charCodeAt(0)));
  emu.writeMemory32(CLI + 0x10, PARENT_NAME >> 2);   // parent's cli_CommandName
  let next = 0x100000;
  const live = new Map<number, number>();
  const exec = {
    allocMem: jest.fn((size: number) => { const a = next; next += (size + 15) & ~7; live.set(a, size); return a; }),
    freeMem: jest.fn((a: number) => { live.delete(a); }),
    getCurrentTaskAddress: () => TASK,
    getStackLower: () => 0, getStackUpper: () => 0, setStackBounds: jest.fn(),
  };
  const dos = new DosLibrary(emu as any, "/tmp");
  (dos as any).processExec = exec;
  dos.setCliInfo(0);
  return { emu, dos, live };
}

describe("a child program's cli_CommandName", () => {
  test("is the child's command while it runs, from AllocMem, and the parent's again after it returns", () => {
    const { emu, dos, live } = setup();
    const ok = (dos as any).startChild({
      entry: 0x5000, stackSize: 4096, argPtr: 0, argLen: 0, commandName: "C:LhA",
      input: 0, output: 0, owned: [], resultOf: (rc: number) => rc, unloadSeg: 0, argBlock: null, ownProcess: false,
    });
    expect(ok).toBe(true);
    (dos as any).pendingContextSwitch(0x6000, 0);

    const childBptr = emu.readMemory32(CLI + 0x10);
    expect(childBptr).not.toBe(PARENT_NAME >> 2);
    expect(emu.bstr(childBptr)).toBe("C:LhA");
    expect(live.has(childBptr << 2)).toBe(true);        // allocated, not a fixed address

    dos.childReturned(0);
    expect(emu.readMemory32(CLI + 0x10)).toBe(PARENT_NAME >> 2);
    expect(emu.bstr(emu.readMemory32(CLI + 0x10))).toBe("DOOR");
    expect(live.has(childBptr << 2)).toBe(false);       // freed
  });

  test("nested children each restore their caller's name", () => {
    const { emu, dos } = setup();
    const start = (name: string) => {
      (dos as any).startChild({
        entry: 0x5000, stackSize: 4096, argPtr: 0, argLen: 0, commandName: name,
        input: 0, output: 0, owned: [], resultOf: (rc: number) => rc, unloadSeg: 0, argBlock: null, ownProcess: false,
      });
      (dos as any).pendingContextSwitch(0x6000, 0);
    };
    start("Zip"); start("Unzip");
    expect(emu.bstr(emu.readMemory32(CLI + 0x10))).toBe("Unzip");
    dos.childReturned(0);
    expect(emu.bstr(emu.readMemory32(CLI + 0x10))).toBe("Zip");
    dos.childReturned(0);
    expect(emu.bstr(emu.readMemory32(CLI + 0x10))).toBe("DOOR");
  });

  test("RunCommand leaves cli_CommandName unchanged (dos.library does not touch it)", () => {
    const { emu, dos } = setup();
    emu.setRegister(1, 0x7000 >> 2);   // D1 = segList
    emu.setRegister(2, 4096);          // D2 = stack size
    (dos as any).RunCommand();
    (dos as any).pendingContextSwitch(0x6000, 0);
    expect(emu.readMemory32(CLI + 0x10)).toBe(PARENT_NAME >> 2);
    dos.childReturned(0);
    expect(emu.readMemory32(CLI + 0x10)).toBe(PARENT_NAME >> 2);
  });
});
