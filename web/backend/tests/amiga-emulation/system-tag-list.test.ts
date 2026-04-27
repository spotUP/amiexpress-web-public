/**
 * Regression: dos.library SystemTagList (LVO -606) must delete
 * RAM:T/ZOOSTAT.TMP and return RC=0 (NORMAL) on success.
 *
 * zOOsTAT (the S stats door) uses SystemTagList on exec version >= 36
 * instead of Execute(). The generic LibraryTraps stub left D0 as the
 * value from the prior Input() call (non-zero), causing the door's
 * TST.L/BEQ to show "NOT deleted" sysop error every run.
 *
 * Two bugs were fixed together:
 *   1. DosLibrary.SystemTagList() implemented (DosLibrary.ts)
 *   2. -606 entry added to dos-vectors.ts so the LibraryTraps dispatch
 *      actually reaches the implementation (handleCall is bypassed by the
 *      stub installer; each LVO needs its own dos-vectors entry).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DosLibrary } from "../../src/amiga-emulation/api/DosLibrary";
import { CPURegister } from "../../src/amiga-emulation/cpu/MoiraEmulator";
import { DOS_VECTORS } from "../../src/amiga-emulation/api/library-vectors/dos-vectors";

// ─── minimal stub ──────────────────────────────────────────────────────────

class StubEmulator {
  private regs = new Map<number, number>();
  private mem  = new Map<number, number>();

  getRegister(reg: number): number         { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, val: number): void { this.regs.set(reg, val >>> 0); }
  readMemory(addr: number): number          { return this.mem.get(addr >>> 0) ?? 0; }
  writeMemory(addr: number, byte: number): void { this.mem.set(addr >>> 0, byte & 0xff); }
  readMemory32(addr: number): number {
    return ((this.readMemory(addr) << 24) | (this.readMemory(addr+1) << 16) |
            (this.readMemory(addr+2) << 8)  |  this.readMemory(addr+3)) >>> 0;
  }
  writeMemory32(addr: number, val: number): void {
    this.writeMemory(addr,   (val >>> 24) & 0xff);
    this.writeMemory(addr+1, (val >>> 16) & 0xff);
    this.writeMemory(addr+2, (val >>>  8) & 0xff);
    this.writeMemory(addr+3,  val         & 0xff);
  }
  readMemory16(addr: number): number {
    return ((this.readMemory(addr) << 8) | this.readMemory(addr+1)) & 0xffff;
  }
  writeMemory16(addr: number, val: number): void {
    this.writeMemory(addr,   (val >> 8) & 0xff);
    this.writeMemory(addr+1,  val       & 0xff);
  }

  /** Write a null-terminated ASCII string into the stub's memory. */
  writeString(addr: number, s: string): void {
    for (let i = 0; i < s.length; i++) this.writeMemory(addr + i, s.charCodeAt(i));
    this.writeMemory(addr + s.length, 0);
  }
}

const STRING_ADDR = 0x10000;  // arbitrary scratch memory for command strings
const STALE_D0   = 0xdeadbeef;

function makeDosWithTmpRoot(): { dos: DosLibrary; stub: StubEmulator; tmpRoot: string } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zoostat-test-"));
  const stub = new StubEmulator();
  const dos  = new DosLibrary(stub as any, tmpRoot);
  stub.setRegister(CPURegister.D0, STALE_D0);
  return { dos, stub, tmpRoot };
}

// ─── SystemTagList implementation tests ───────────────────────────────────

describe("DosLibrary SystemTagList (LVO -606)", () => {

  test("handleCall(-606) is recognised and returns true", () => {
    const { dos, stub, tmpRoot } = makeDosWithTmpRoot();
    stub.writeString(STRING_ADDR, "delete RAM:T/NOOP.TMP");
    stub.setRegister(CPURegister.D1, STRING_ADDR);
    expect(dos.handleCall(-606)).toBe(true);
    fs.rmSync(tmpRoot, { recursive: true });
  });

  test("delete <existing file> sets D0=0 (RC_NORMAL) and removes the file", () => {
    const { dos, stub, tmpRoot } = makeDosWithTmpRoot();

    // Create a stand-in for RAM:T/ using the pathResolver's /tmp/ram/T mapping.
    // Because pathManager is null in this unit test, pathResolver.resolve() runs:
    //   RAM:T/ZOOSTAT.TMP  →  /tmp/ram/T/ZOOSTAT.TMP
    // We use a real temp file at that exact path.
    const ramT = "/tmp/ram/T";
    fs.mkdirSync(ramT, { recursive: true });
    const filePath = path.join(ramT, "ZOOSTAT.TMP");
    fs.writeFileSync(filePath, "dummy stats content");
    expect(fs.existsSync(filePath)).toBe(true);

    stub.writeString(STRING_ADDR, "delete RAM:T/ZOOSTAT.TMP");
    stub.setRegister(CPURegister.D1, STRING_ADDR);

    dos.handleCall(-606);

    expect(stub.getRegister(CPURegister.D0)).toBe(0);          // RC=0 = NORMAL
    expect(fs.existsSync(filePath)).toBe(false);               // file gone

    fs.rmSync(tmpRoot, { recursive: true });
  });

  test("delete <missing file> sets D0=10 (RC_ERROR)", () => {
    const { dos, stub, tmpRoot } = makeDosWithTmpRoot();

    stub.writeString(STRING_ADDR, "delete RAM:T/NOEXIST.TMP");
    stub.setRegister(CPURegister.D1, STRING_ADDR);

    dos.handleCall(-606);

    expect(stub.getRegister(CPURegister.D0)).toBe(10);         // RC=10 = ERROR

    fs.rmSync(tmpRoot, { recursive: true });
  });

  test("D0 is NOT left as the stale pre-call value", () => {
    // This is the original regression: stub returned emu.getRegister(0)
    // unchanged, leaving whatever D0 was before the JSR (e.g. Input()'s BPTR).
    const { dos, stub, tmpRoot } = makeDosWithTmpRoot();
    stub.setRegister(CPURegister.D0, STALE_D0);
    stub.writeString(STRING_ADDR, "delete RAM:T/IRRELEVANT.TMP");
    stub.setRegister(CPURegister.D1, STRING_ADDR);

    dos.handleCall(-606);

    expect(stub.getRegister(CPURegister.D0)).not.toBe(STALE_D0);

    fs.rmSync(tmpRoot, { recursive: true });
  });
});

// ─── dos-vectors wiring test ──────────────────────────────────────────────

describe("DOS_VECTORS dispatch wiring", () => {
  test("-606 (SystemTagList) is registered in DOS_VECTORS", () => {
    const entry = DOS_VECTORS.find(v => v.offset === -606);
    expect(entry).toBeDefined();
    expect(entry?.name).toBe("SystemTagList");
  });

  test("SystemTagList handler calls lib.SystemTagList", () => {
    const entry = DOS_VECTORS.find(v => v.offset === -606)!;
    const called: string[] = [];
    const fakeLib = {
      SystemTagList: () => { called.push("SystemTagList"); },
    };
    const fakeEmu = { getRegister: (_r: number) => 0 };
    (entry.handler as any)(fakeEmu, fakeLib);
    expect(called).toContain("SystemTagList");
  });
});
