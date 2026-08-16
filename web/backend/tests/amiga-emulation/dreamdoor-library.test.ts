import { DreamDoorLibrary } from "../../src/amiga-emulation/api/DreamDoorLibrary";
import { DP_OFFSET, USER_OFFSET, DP_SIZEOF } from "../../src/amiga-emulation/dd/dd-constants";

class MemStub {
  mem = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory32(a: number) {
    return (((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) |
      (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0);
  }
  writeMemory32(a: number, v: number) {
    this.writeMemory(a, v >>> 24); this.writeMemory(a + 1, v >>> 16);
    this.writeMemory(a + 2, v >>> 8); this.writeMemory(a + 3, v);
  }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >>> 8); this.writeMemory(a + 1, v); }
  readString(a: number, max: number) {
    let s = ""; for (let i = 0; i < max; i++) { const c = this.readMemory(a + i); if (c === 0) break; s += String.fromCharCode(c); }
    return s;
  }
}

describe("DreamDoorLibrary", () => {
  it("does not collide with INTUITION_LIB_ADDR (0x0e0000) — allocates via the injected allocator, not a static 0xE0000 base", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000; // far from any *_LIB_ADDR constant
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT", location: "Earth" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 1 }, { emit: () => true });
    const nodeAddr = 0x1000;
    "1\0".split("").forEach((c, i) => emu.writeMemory(nodeAddr + i, c.charCodeAt(0)));
    const handle = lib.initDoor(nodeAddr);
    expect(handle).not.toBe(0);
    // The old bug hardcoded DREAMDOOR_BASE = 0xE0000, landing squarely on
    // INTUITION_LIB_ADDR (0x0e0000). The fix allocates through the injected
    // exec allocator instead, so the handle must land in the caller-supplied
    // allocation region (0x300000+ here) and never inside — or below — the
    // INTUITION+GRAPHICS region (0x0e0000..0x0e8000+).
    expect(handle).toBeGreaterThanOrEqual(0x0e0000 + 0x8000); // above INTUITION+GRAPHICS region, i.e. not inside it
    expect(handle).toBe(0x300000); // exactly the allocator's first allocation — proves no static base is used
  });

  it("InquirePointers fills the caller's buffer using the confirmed dp_* offsets", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 3 }, { emit: () => true });
    const nodeAddr = 0x1000;
    emu.writeMemory(nodeAddr, "1".charCodeAt(0));
    const handle = lib.initDoor(nodeAddr);
    const outBuf = 0x400000;
    lib.inquirePointers(outBuf, handle);
    const curUserPtr = emu.readMemory32(outBuf + DP_OFFSET.dp_CurrUser);
    expect(curUserPtr).not.toBe(0);
    const handleStr = emu.readString(curUserPtr + USER_OFFSET.USER_HANDLE, 32);
    expect(handleStr).toBe("SPOT");
    const curConfPtr = emu.readMemory32(outBuf + DP_OFFSET.dp_CurrConf);
    expect(emu.readMemory(curConfPtr)).toBe(3); // CONF_NUMBER
  });

  it("allocates structures sized DP_SIZEOF/USER_SIZEOF via the injected allocator (no static base address)", () => {
    const emu = new MemStub();
    const sizes: number[] = [];
    let nextAlloc = 0x500000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { sizes.push(size); const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT" }, conferenceId: 1 }, { emit: () => true });
    lib.initDoor(0x1000);
    expect(sizes[0]).toBe(DP_SIZEOF);
    expect(sizes.length).toBeGreaterThanOrEqual(5); // DP, USER, CONF, CFG, node-info
  });
});
