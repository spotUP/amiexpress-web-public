/**
 * A door finds its config named after the program it was started as.
 *
 * AmigaOS stores the command AS INVOKED in cli_CommandName and GetProgramName
 * copies it. express.e runDoor hands SystemTagList "<LOCATION> <node>", so
 * TERM (LOCATION=bbs:amixnet/doors/TERM) sees "bbs:amixnet/doors/TERM" and
 * builds sprintf("%s.cfg", name) = "bbs:amixnet/doors/TERM.cfg", beside its
 * binary. The bare name "term" made it open ./term.cfg, which is not there.
 *
 * One reachability chain: the icon -> the command definition -> the name the
 * door's CLI carries -> what GetProgramName (LVO -576) writes into the buffer.
 */
import * as path from "path";
import * as fs from "fs";
import { loadCommandFromInfo } from "../../src/utils/amiga-command-parser.util";
import { doorProgramName } from "../../src/amiga-emulation/DoorTypes";
import { DosLibrary } from "../../src/amiga-emulation/api/DosLibrary";
import { CPURegister } from "../../src/amiga-emulation/cpu/MoiraEmulator";

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, v: number): void { this.regs.set(reg, v >>> 0); }
  readMemory(a: number): number { return this.mem.get(a >>> 0) ?? 0; }
  readMemory32(a: number): number {
    return ((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) | (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0;
  }
  writeMemory32(a: number, v: number): void {
    for (let i = 0; i < 4; i++) this.writeMemory(a + i, (v >>> (24 - 8 * i)) & 0xff);
  }
  writeMemory(a: number, b: number): void { this.mem.set(a >>> 0, b & 0xff); }
  writeString(a: number, s: string): void {
    for (let i = 0; i < s.length; i++) this.writeMemory(a + i, s.charCodeAt(i));
    this.writeMemory(a + s.length, 0);
  }
  cstr(a: number): string {
    let out = "";
    for (let b = this.readMemory(a); b !== 0; b = this.readMemory(++a)) out += String.fromCharCode(b);
    return out;
  }
}

function getProgramName(name: string): string {
  const stub = new StubEmulator();
  const dos = new DosLibrary(stub as any, "/tmp");
  // The door launch's CLI: exec ThisTask (execBase+0x114) -> pr_CLI -> cli_CommandName BSTR.
  const EXEC = 0x2000, TASK = 0x3000, CLI = 0x4000, BSTR = 0x5000;
  stub.writeMemory32(4, EXEC);
  stub.writeMemory32(EXEC + 0x114, TASK);
  stub.writeMemory32(TASK + 0xac, CLI >> 2);
  stub.writeMemory32(CLI + 0x10, BSTR >> 2);
  stub.writeMemory(BSTR, name.length);
  for (let i = 0; i < name.length; i++) stub.writeMemory(BSTR + 1 + i, name.charCodeAt(i));
  dos.setCliInfo(0);
  stub.setRegister(CPURegister.D1, 0x1000);
  stub.setRegister(CPURegister.D2, 256);
  expect(dos.handleCall(-576)).toBe(true);
  return stub.cstr(0x1000);
}

const termInfo = path.resolve(__dirname, "../../../../board/Commands/SysCmd/TERM.info");

describe("a door finds its config named after the program it was started as", () => {
  (fs.existsSync(termInfo) ? test : test.skip)(
    "TERM's LOCATION reaches GetProgramName as the invoked name, so TERM.cfg sits beside the binary",
    () => {
      const cmd = loadCommandFromInfo(termInfo)!;
      expect(cmd.invokedName).toBe("bbs:amixnet/doors/TERM");
      const name = doorProgramName({ invokedName: cmd.invokedName, executablePath: "/x/AmiXnet/Doors/term" });
      expect(getProgramName(name) + ".cfg").toBe("bbs:amixnet/doors/TERM.cfg");
    },
  );

  test("the invoked name is the first word of the command line, unquoted", () => {
    const base = { executablePath: "/x/y/door" };
    expect(doorProgramName({ ...base, invokedName: '"Work:My Doors/Foo" 1' })).toBe("Work:My Doors/Foo");
    expect(doorProgramName({ ...base, invokedName: "bbs:doors/foo 1" })).toBe("bbs:doors/foo");
  });

  test("without a LOCATION the BBS command name, then the file name, stand in", () => {
    expect(doorProgramName({ executablePath: "/x/y/door", bbsSession: { doorCommand: "n" } })).toBe("N");
    expect(doorProgramName({ executablePath: "/x/y/door" })).toBe("door");
  });
});
