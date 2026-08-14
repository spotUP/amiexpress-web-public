import { FameLibrary } from "../../src/amiga-emulation/api/FameLibrary";
import { fameVectors } from "../../src/amiga-emulation/api/library-vectors/fame-vectors";
import { FAMEDOORMSG_SIZE } from "../../src/amiga-emulation/fim/fim-constants";
import { MemStub } from "./helpers/mem-stub";

describe("FAME.library", () => {
  it("FAMEAllocObject(1) returns a 282-byte zeroed block", () => {
    const emu = new MemStub();
    let nextAlloc = 0x200000;
    const lib = new FameLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    const addr = lib.allocObject(1);
    expect(addr).toBe(0x200000);
    expect(emu.readMemory32(addr)).toBe(0);
    expect(emu.readMemory32(addr + FAMEDOORMSG_SIZE - 4)).toBe(0);
  });
  it("FAMEStrCopy respects maxLen and NUL-terminates", () => {
    const emu = new MemStub();
    const lib = new FameLibrary(emu as never, { allocMem: () => 0, freeMem: () => undefined });
    const src = 0x1000, dst = 0x2000;
    for (let i = 0; i < 5; i++) emu.writeMemory(src + i, "HELLO".charCodeAt(i));
    emu.writeMemory(src + 5, 0);
    lib.strCopy(src, dst, 4);
    expect(String.fromCharCode(emu.readMemory(dst), emu.readMemory(dst + 1), emu.readMemory(dst + 2))).toBe("HEL");
    expect(emu.readMemory(dst + 3)).toBe(0);
  });
  it("vector table covers FAMEAllocObject at LVO -204 (fd bias 30)", () => {
    const alloc = fameVectors.find(v => v.name === "FAMEAllocObject");
    expect(alloc?.offset).toBe(-204);
    const free = fameVectors.find(v => v.name === "FAMEFreeObject");
    expect(free?.offset).toBe(-210);
    const strcopy = fameVectors.find(v => v.name === "FAMEStrCopy");
    expect(strcopy?.offset).toBe(-150);
  });
});
