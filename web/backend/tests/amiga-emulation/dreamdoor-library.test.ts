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
  readMemory16(a: number) { return ((this.readMemory(a) << 8) | this.readMemory(a + 1)) & 0xffff; }
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
    lib.setSession({ user: { username: "SPOT", location: "Earth" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 1 }, { emit: () => true });
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
    lib.setSession({ user: { username: "SPOT" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 3 }, { emit: () => true });
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

  it("InquirePointers reads the REAL BBSSession/User field names, not invented ones (regression: DreamDoorSessionUser used to declare name/securityLevel/bytesUploaded/bytesDownloaded/screenLength/user-level timeRemaining, none of which the live session ever populates -- every DreamDoor door silently saw 'Guest' + all-default numeric fields for every caller)", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    // Field names exactly as the real BBSSession/User shape provides them
    // (types.ts User interface + AmigaDoorSession/LibraryManager's own
    // `bbsSession?.user?.username` convention) -- NOT the DreamDoorSessionUser
    // interface's old invented names.
    lib.setSession(
      {
        user: {
          username: "RIVERBED",
          location: "Earth",
          phone: "555-1234",
          secLevel: 200,
          uploads: 4,
          downloads: 7,
          bytesUpload: 10240,
          bytesDownload: 20480,
          messagesPosted: 3,
          timesCalled: 12,
          ratio: 2,
          dailyTimeLimit: 90,
          linesPerScreen: 22,
        },
        conferenceId: 1,
        timeRemaining: 42, // session-level, not a user field
      },
      { emit: () => true },
    );
    const nodeAddr = 0x1000;
    emu.writeMemory(nodeAddr, "1".charCodeAt(0));
    const handle = lib.initDoor(nodeAddr);
    const outBuf = 0x400000;
    lib.inquirePointers(outBuf, handle);
    const curUserPtr = emu.readMemory32(outBuf + DP_OFFSET.dp_CurrUser);

    expect(emu.readString(curUserPtr + USER_OFFSET.USER_HANDLE, 32)).toBe("RIVERBED");
    expect(emu.readMemory(curUserPtr + USER_OFFSET.USER_SECURITYLEVEL)).toBe(200);
    expect(emu.readMemory32(curUserPtr + USER_OFFSET.USER_ULBYTES)).toBe(10240);
    expect(emu.readMemory32(curUserPtr + USER_OFFSET.USER_DLBYTES)).toBe(20480);
    expect(emu.readMemory(curUserPtr + USER_OFFSET.USER_SCREENLENGTH)).toBe(22);
    expect(emu.readMemory16(curUserPtr + USER_OFFSET.USER_TIMEREMAINING)).toBe(42);
  });

  it("allocates structures sized DP_SIZEOF/USER_SIZEOF via the injected allocator (no static base address)", () => {
    const emu = new MemStub();
    const sizes: number[] = [];
    let nextAlloc = 0x500000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { sizes.push(size); const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { username: "SPOT" }, conferenceId: 1 }, { emit: () => true });
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
    lib.setSession({ user: { username: "SPOT" }, conferenceId: 1 }, { emit: () => true });
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
    lib.setSession({ user: { username: "SPOT" }, conferenceId: 1 }, { emit: (_e: string, s: string) => emitted.push(s) });

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
    lib.setSession({ user: { username: "SPOT" }, conferenceId: 1 }, { emit: (_e: string, s: string) => emitted.push(s) });

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

describe("DreamDoorLibrary terminal-text conversion (layout-bug fix, found live-testing DreamTagWall/AVH-BaudCheck, 2026-08-16)", () => {
  // SendString/Prompt read RAW text straight out of the door's own 68K
  // memory. Real Amiga doors rely on console.device's leniency: bare CSI
  // (0x9B) / bare "[32m" ANSI codes without an ESC prefix, and bare LF
  // line endings (no CR). A modern xterm.js terminal does neither —
  // bare "[" codes print as literal garbage text and bare LF produces
  // the classic staircase effect. xim/system-commands.ts's equivalent
  // raw-Amiga-text-read call sites already wrap every emit in
  // convertAmigaTextForTerminal(); DreamDoorLibrary's SendString/Prompt
  // didn't, until this fix.
  function makeDirectLib() {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    return { emu, lib };
  }

  it("SendString converts a bare Amiga CSI byte (0x9B) into a proper ESC[ sequence", () => {
    const { emu, lib } = makeDirectLib();
    const emitted: string[] = [];
    lib.setSession({}, { emit: (_e: string, s?: string) => { if (s) emitted.push(s); return true; } });
    const handle = lib.initDoor(0x1000);

    const strAddr = 0x4000;
    // "\x9b32mRED\x9b0m" — Amiga bare-CSI color codes, no ESC prefix.
    const raw = "\x9b32mRED\x9b0m";
    raw.split("").forEach((c, i) => emu.writeMemory(strAddr + i, c.charCodeAt(0)));

    lib.sendString(handle, strAddr);

    expect(emitted).toContain("\x1b[32mRED\x1b[0m");
    // The bare, un-prefixed form must NOT reach the terminal as literal text.
    expect(emitted.some(s => s.includes("\x9b"))).toBe(false);
  });

  it("SendString converts bare LF line endings to CRLF (no staircase effect)", () => {
    const { emu, lib } = makeDirectLib();
    const emitted: string[] = [];
    lib.setSession({}, { emit: (_e: string, s?: string) => { if (s) emitted.push(s); return true; } });
    const handle = lib.initDoor(0x1000);

    const strAddr = 0x4000;
    const raw = "line one\nline two\n";
    raw.split("").forEach((c, i) => emu.writeMemory(strAddr + i, c.charCodeAt(0)));

    lib.sendString(handle, strAddr);

    expect(emitted).toContain("line one\r\nline two\r\n");
  });

  it("Prompt's prompt-text echo (read from A0) also converts bare ANSI/LF, not just SendString", () => {
    const { emu, lib } = makeDirectLib();
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const emitted: string[] = [];
    lib.setSession({}, { emit: (_e: string, s?: string) => { if (s) emitted.push(s); return true; } });
    const handle = lib.initDoor(0x1000);

    const bufferAddr = 0x2000;
    const raw = "\x9b4m\x9b32mBanner line\nDo you want to continue?";
    raw.split("").forEach((c, i) => emu.writeMemory(bufferAddr + i, c.charCodeAt(0)));

    lib.prompt(handle, bufferAddr, 0, 30, 1);

    expect(emitted).toContain("\x1b[4m\x1b[32mBanner line\r\nDo you want to continue?");
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

  // Important 3 (DD final-review wave, 2026-08-16): the CONFIRMED binding
  // spec (thoughts/shared/research/2026-08-14_fame-dd-door-compat.md, LVO
  // -48 row) has Prompt's message text living in the A0 BUFFER (prompt
  // text copied in by the door, answer copied back in place by the BBS) —
  // there is no separate A1 prompt-text pointer in the real protocol. An
  // earlier implementation-plan revision wrongly prescribed A1; this
  // describe block pins the corrected priority: A0 first, A1 only as a
  // legacy fallback when A0 reads back empty.
  it("reads prompt text from the A0 buffer when populated, even if A1 also holds text (A0 wins)", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const out: string[] = [];
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
    const handle = lib.initDoor(0x1000);

    const buf = 0x510000, legacyA1 = 0x500000;
    "Real prompt (A0)>".split("").forEach((c, i) => emu.writeMemory(buf + i, c.charCodeAt(0)));
    "Stale residual A1 text".split("").forEach((c, i) => emu.writeMemory(legacyA1 + i, c.charCodeAt(0)));

    lib.prompt(handle, buf, legacyA1, 40, 0);

    expect(out[0]).toBe("Real prompt (A0)>");
    expect(out).not.toContain("Stale residual A1 text");
  });

  it("falls back to A1 only when the A0 buffer reads back empty (spec-nonconformant / legacy door)", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const out: string[] = [];
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
    const handle = lib.initDoor(0x1000);

    const buf = 0x510000, legacyA1 = 0x500000; // buf left unwritten (all-zero -> empty string)
    "Legacy A1 prompt>".split("").forEach((c, i) => emu.writeMemory(legacyA1 + i, c.charCodeAt(0)));

    lib.prompt(handle, buf, legacyA1, 40, 0);

    expect(out[0]).toBe("Legacy A1 prompt>");
  });

  it("emits nothing when both A0 and A1 read back empty (no garbage-memory echo)", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const out: string[] = [];
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
    const handle = lib.initDoor(0x1000);

    lib.prompt(handle, 0x510000, 0x500000, 40, 0); // both addresses never written -> empty

    expect(out).toEqual([]);
  });
});

// Root-cause bug: SGR mouse-tracking reports from the terminal (e.g.
// "\x1b[<35;17;15M") reach queueInput() while a DD door has a pending
// Prompt. drainPromptInput used to treat every printable-ASCII byte as a
// keystroke, so "[<35;17;15M" (everything but the leading ESC) got typed
// into the user's prompt buffer just from the mouse moving over the
// terminal. Fixed by routing queueInput's input through the same stateful
// EscapeSequenceStripper FIMProtocol.queueInput uses (escape-sequence-
// stripper.ts) — one instance per DreamDoorLibrary, stripped BEFORE
// buffering so drainPromptInput never sees the CSI bytes at all.
describe("DreamDoorLibrary queueInput CSI/mouse-report stripping", () => {
  function pendingPromptLib() {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const out: string[] = [];
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
    const handle = lib.initDoor(0x1000);
    const buf = 0x510000;
    lib.prompt(handle, buf, 0, 40, 0); // no CR yet -> stays pending
    return { emu, lib, out, buf };
  }

  it("drops a complete SGR mouse report delivered in one chunk — prompt buffer stays empty", () => {
    const { emu, lib, out, buf } = pendingPromptLib();
    out.length = 0;
    lib.queueInput("\x1b[<35;17;15M");
    expect(out).toEqual([]); // nothing echoed — the report never reached the line editor
    lib.queueInput("\r"); // complete with an otherwise-empty line
    expect(emu.readString(buf, 40)).toBe("");
  });

  it("drops a mouse report split across two deliveries", () => {
    const { emu, lib, out, buf } = pendingPromptLib();
    out.length = 0;
    lib.queueInput("\x1b[<35;17");
    lib.queueInput(";15M");
    expect(out).toEqual([]);
    lib.queueInput("\r");
    expect(emu.readString(buf, 40)).toBe("");
  });

  it("keeps real text with a mouse report embedded mid-stream", () => {
    const { emu, lib, buf } = pendingPromptLib();
    lib.queueInput("ab\x1b[<35;17;15Mcd\r");
    expect(emu.readString(buf, 40)).toBe("abcd");
  });
});

describe("DreamDoorLibrary isActive() (Important 2, DD final-review wave)", () => {
  function makeInactiveLib() {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    return new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
  }

  it("is false before InitDoor and true once InitDoor has run", () => {
    const lib = makeInactiveLib();
    expect(lib.isActive()).toBe(false);

    lib.setSession({}, { emit: () => true });
    lib.initDoor(0x1000);
    expect(lib.isActive()).toBe(true);
  });

  it("is true even when NOT currently waiting on a deferred Prompt/GetKey — this is the type-ahead fix: routing must not gate on isWaitingForInput()", () => {
    const lib = makeInactiveLib();
    lib.setSession({}, { emit: () => true });
    lib.initDoor(0x1000);

    // No Prompt/GetKey call is pending right now.
    expect(lib.isWaitingForInput()).toBe(false);
    // ...but the door is still active, so a live keystroke must still be
    // routed to this library (queueInput's own type-ahead buffering),
    // not fall through to DOS stdin.
    expect(lib.isActive()).toBe(true);
  });

  it("goes back to false after CloseDoor", () => {
    const lib = makeInactiveLib();
    lib.setSession({}, { emit: () => true });
    const handle = lib.initDoor(0x1000);
    expect(lib.isActive()).toBe(true);

    lib.closeDoor(handle);
    expect(lib.isActive()).toBe(false);
  });

  it("end-to-end type-ahead: a keystroke queued while NOT waiting lands in the buffer, and the next prompt() completes synchronously from it (no pause)", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    let paused = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({}, { emit: () => true });
    const handle = lib.initDoor(0x1000);

    // Door is active but nothing is deferred yet (no Prompt/GetKey call has
    // run) — this is exactly the window the OLD isWaitingForInput()-gated
    // router dropped to DOS stdin instead of here.
    expect(lib.isActive()).toBe(true);
    expect(lib.isWaitingForInput()).toBe(false);

    lib.queueInput("spot\r"); // type-ahead, buffered — nothing pending to complete yet

    const buf = 0x520000;
    const result = lib.prompt(handle, buf, 0, 40, 0);

    // A CR was already in the type-ahead backlog, so the request completes
    // synchronously (prompt()'s doc comment) — the emulator is never
    // paused and the real status is returned directly.
    expect(paused).toBe(false);
    expect(result).toBe(1);
    expect(emu.readString(buf, 40)).toBe("spot");
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
