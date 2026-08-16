import { DreamDoorLibrary } from "../../src/amiga-emulation/api/DreamDoorLibrary";
import { DP_OFFSET, USER_OFFSET, DP_SIZEOF, DD_LVO } from "../../src/amiga-emulation/dd/dd-constants";
import { DREAMDOOR_VECTORS } from "../../src/amiga-emulation/api/library-vectors/dreamdoor-vectors";

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
  // No-op default so callers that don't care about D0 (e.g. the deferred
  // Prompt test, which only asserts on the caller buffer + resume flag)
  // don't need to stub it themselves. Tests that DO care (e.g. the
  // deferred GetKey test) override this per-instance.
  setRegister(_r: number, _v: number) {}
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

describe("dreamdoor-vectors offset table", () => {
  it("matches DD_LVO exactly — no leftover guessed offsets", () => {
    const byName = Object.fromEntries(DREAMDOOR_VECTORS.map(v => [v.name, v.offset]));
    expect(byName.InitDoor).toBe(DD_LVO.InitDoor);
    expect(byName.CloseDoor).toBe(DD_LVO.CloseDoor);
    expect(byName.SendString).toBe(DD_LVO.SendString);
    expect(byName.Prompt).toBe(DD_LVO.Prompt);
    expect(byName.InquirePointers).toBe(DD_LVO.InquirePointers);
    expect(byName.DisplayFile).toBe(DD_LVO.DisplayFile);
    expect(byName.JoinConference).toBe(DD_LVO.JoinConference);
    expect(byName.XprSend).toBe(DD_LVO.XprSend);
    expect(byName.GetKey).toBe(DD_LVO.GetKey);
    expect(byName.ScanFileDirs).toBe(DD_LVO.ScanFileDirs);
    expect(byName.Disconnect).toBe(DD_LVO.Disconnect);
    expect(byName.DDCommand).toBe(DD_LVO.DDCommand);
    // no two vectors share the wrong slot 6-apart-from-InitDoor-at--6 pattern
    expect(byName.InitDoor).not.toBe(-6);
  });
});

describe("dreamdoor-vectors register wiring", () => {
  class RegisterStub extends MemStub {
    regs = new Map<number, number>();
    paused = false;
    getRegister(n: number) { return this.regs.get(n) ?? 0; }
    setRegister(n: number, v: number) { this.regs.set(n, v); }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
  }

  function findVector(name: string) {
    const v = DREAMDOOR_VECTORS.find(entry => entry.name === name);
    if (!v) throw new Error(`vector ${name} not found`);
    return v;
  }

  function makeLib(emu: RegisterStub) {
    let nextAlloc = 0x300000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT" }, conferenceId: 1 }, { emit: () => true });
    return lib;
  }

  it("InitDoor reads A0 (register 8) and returns a handle in D0", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const nodeAddr = 0x1000;
    emu.writeMemory(nodeAddr, "1".charCodeAt(0));
    emu.setRegister(8, nodeAddr); // A0
    const handle = findVector("InitDoor").handler(emu as never, lib as never);
    expect(handle).not.toBe(0);
    expect(handle).toBe(0x300000); // allocator's first allocation, per initDoor's handle==pointersAddr convention
  });

  it("Prompt reads D0/A0/A1/D1/D2 per the confirmed calling convention and forwards to lib.prompt", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);

    const bufferAddr = 0x2000;
    const promptTextAddr = 0x3000;
    const promptText = "Enter name: ";
    promptText.split("").forEach((c, i) => emu.writeMemory(promptTextAddr + i, c.charCodeAt(0)));
    emu.writeMemory(promptTextAddr + promptText.length, 0);

    emu.setRegister(0, handle); // D0
    emu.setRegister(8, bufferAddr); // A0
    emu.setRegister(9, promptTextAddr); // A1
    emu.setRegister(1, 30); // D1 = maxLen
    emu.setRegister(2, 1); // D2 = mode

    const emitted: string[] = [];
    lib.setSession({ user: { name: "SPOT" }, conferenceId: 1 }, { emit: (_e: string, s: string) => emitted.push(s) });

    // No type-ahead is buffered, so Prompt defers (Task 4): the handler
    // returns a placeholder D0 and pauses the emulator, completing later
    // via queueInput(). See the dedicated deferred-Prompt test below for
    // the full pause -> queueInput -> resume round trip.
    const result = findVector("Prompt").handler(emu as never, lib as never);
    expect(result).toBe(0);
    expect(emu.paused).toBe(true);
    expect(emitted).toContain(promptText);
  });

  it("Prompt tolerates a zero/garbage A1 (client quirk) without throwing", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);

    emu.setRegister(0, handle); // D0
    emu.setRegister(8, 0x2000); // A0
    emu.setRegister(9, 0); // A1 = 0, "no prompt text"
    emu.setRegister(1, 30); // D1
    emu.setRegister(2, 1); // D2

    expect(() => findVector("Prompt").handler(emu as never, lib as never)).not.toThrow();
  });

  it("SendString reads D0 (handle) and A0 (string ptr)", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);

    const strAddr = 0x4000;
    const text = "Hello";
    text.split("").forEach((c, i) => emu.writeMemory(strAddr + i, c.charCodeAt(0)));
    emu.writeMemory(strAddr + text.length, 0);

    const emitted: string[] = [];
    lib.setSession({ user: { name: "SPOT" }, conferenceId: 1 }, { emit: (_e: string, s: string) => emitted.push(s) });

    emu.setRegister(0, handle); // D0
    emu.setRegister(8, strAddr); // A0
    findVector("SendString").handler(emu as never, lib as never);
    expect(emitted).toContain(text);
  });

  it("GetKey reads D0 (handle) and D1 (flags)", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);
    emu.setRegister(0, handle); // D0
    emu.setRegister(1, 7); // D1 = flags
    expect(() => findVector("GetKey").handler(emu as never, lib as never)).not.toThrow();
  });

  it("JoinConference reads D0 (handle) and D1 (conference number)", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);
    emu.setRegister(0, handle); // D0
    emu.setRegister(1, 4); // D1 = conf number
    const result = findVector("JoinConference").handler(emu as never, lib as never);
    expect(result).toBe(handle);
  });

  it("XprSend reads D0/A0/A1", () => {
    const emu = new RegisterStub();
    const lib = makeLib(emu);
    const handle = findVector("InitDoor").handler(emu as never, lib as never);
    emu.setRegister(0, handle); // D0
    emu.setRegister(8, 0x5000); // A0 = file-list ptr
    emu.setRegister(9, 0x6000); // A1 = device override ptr
    expect(() => findVector("XprSend").handler(emu as never, lib as never)).not.toThrow();
  });
});

describe("DreamDoorLibrary deferred Prompt/GetKey (Task 4)", () => {
  it("Prompt defers until queueInput, echoes prompt text first, writes answer into the caller buffer", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const out: string[] = [];
    let paused = false, resumed = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
    const handle = lib.initDoor(0x1000);
    const promptText = 0x500000, buf = 0x510000;
    "Name>".split("").forEach((c, i) => emu.writeMemory(promptText + i, c.charCodeAt(0)));
    lib.prompt(handle, buf, promptText, 20, 0);
    expect(out[0]).toBe("Name>");
    expect(paused).toBe(true);
    lib.queueInput("spot\r");
    expect(resumed).toBe(true);
    expect(emu.readString(buf, 20)).toBe("spot");
  });

  it("GetKey defers until queueInput and resolves the key code", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    let resumeD0 = -1;
    (emu as unknown as { pause(): void; resume(): void; setRegister(r: number, v: number): void }).pause = () => undefined;
    (emu as unknown as { resume(): void }).resume = () => undefined;
    (emu as unknown as { setRegister(r: number, v: number): void }).setRegister = (r: number, v: number) => { if (r === 0) resumeD0 = v; };
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: () => true });
    const handle = lib.initDoor(0x1000);
    lib.getKey(handle, 0);
    lib.queueInput("y");
    expect(resumeD0).toBe(121); // 'y'
  });
});

describe("DreamDoorLibrary pending-input teardown (Task 4 review fix)", () => {
  type PendingInputInternals = {
    inputBuffer: string;
    pendingPromptBuffer: number | null;
    pendingPromptMaxLen: number;
    pendingPromptMode: number;
    promptLineBuffer: string;
    pendingKeyPending: boolean;
  };

  it("closeDoor clears a pending Prompt, resumes a paused emulator, and a subsequent InitDoor/Prompt starts clean", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    let paused = false, resumeCalls = 0;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumeCalls++; paused = false; };
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: () => true });
    const handle = lib.initDoor(0x1000);
    const promptText = 0x500000, buf = 0x510000;
    "Name>".split("").forEach((c, i) => emu.writeMemory(promptText + i, c.charCodeAt(0)));

    lib.prompt(handle, buf, promptText, 20, 0);
    expect(paused).toBe(true);
    lib.queueInput("ab"); // partial line, no CR yet — leaves dirty pending state

    lib.closeDoor(handle);

    // Regression: closeDoor must resume a still-paused emulator — without
    // this, nothing is left pending to ever call resume() again and the
    // CPU stays hung forever.
    expect(resumeCalls).toBeGreaterThan(0);
    expect(paused).toBe(false);

    const internals = lib as unknown as PendingInputInternals;
    expect(internals.pendingPromptBuffer).toBeNull();
    expect(internals.pendingPromptMaxLen).toBe(0);
    expect(internals.pendingPromptMode).toBe(0);
    expect(internals.promptLineBuffer).toBe("");
    expect(internals.inputBuffer).toBe("");
    expect(internals.pendingKeyPending).toBe(false);

    // A fresh InitDoor + Prompt on the same library instance must start
    // clean — no leaked "ab" from the previous door's aborted prompt line.
    const handle2 = lib.initDoor(0x1000);
    const buf2 = 0x520000;
    lib.prompt(handle2, buf2, promptText, 20, 0);
    lib.queueInput("spot\r");
    expect(emu.readString(buf2, 20)).toBe("spot");
  });

  it("closeDoor clears a pending GetKey and resumes the emulator", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    let resumeCalls = 0;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumeCalls++; };
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: () => true });
    const handle = lib.initDoor(0x1000);

    lib.getKey(handle, 0); // no type-ahead — pauses, pendingKeyPending = true
    lib.closeDoor(handle);

    expect(resumeCalls).toBeGreaterThan(0);
    expect((lib as unknown as PendingInputInternals).pendingKeyPending).toBe(false);
  });

  it("initDoor defensively resets pending input even without a prior closeDoor", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: () => true });
    lib.initDoor(0x1000);
    lib.getKey(lib.initDoor(0x1000), 0); // pauses, pendingKeyPending = true — never closed

    // Re-init without going through closeDoor() first (e.g. an external
    // teardown/reinit path that skips it).
    lib.initDoor(0x1000);

    expect((lib as unknown as PendingInputInternals).pendingKeyPending).toBe(false);
  });
});
