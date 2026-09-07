/**
 * A door that opens its OWN header file gets the sysop's 40-column copy.
 *
 * THE ROUTE THIS COVERS, and why it needed its own. A door's display file
 * reaches it one of two ways, and they are resolved in different places:
 *
 *   - XIM `JH_SF`/`JH_SG` - the BBS shows the file. `wall` and `games` take
 *     this route, and `xim/io-file-display.ts` has answered it with a `_C64`
 *     rung since 2026-09-07 (tests/amiga-emulation/jh-sf-forty-column-variant).
 *   - dos.library `Open()` - the DOOR reads the file itself. `ctop` and
 *     `conftop` take this one for `BBS:Conf<n>/Conftop.header` and `.tailer`,
 *     and nothing on that path knew the caller's width at all.
 *
 * From the door's side the two are indistinguishable, which is exactly how a
 * fix aimed at one silently misses the other - the shape that produced nine
 * bugs in this tree. So the NAMING RULE is one function
 * (`utils/narrow-art.util.ts`) and this suite pins the second route's use of
 * it, end to end: the bytes the door reads back out of the handle.
 *
 * The guards are as load-bearing as the feature:
 *   - no narrow copy drawn -> the door's own file, unchanged;
 *   - an 80-column caller -> the door's own file, unchanged;
 *   - a WRITE -> never redirected, or a door would save its data into a file
 *     named for a screen.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

const MODE_OLDFILE = 1005;
const MODE_NEWFILE = 1006;

const WIDE = 'the eighty column conference header';
const NARROW = 'the forty column conference header';

/** Byte-addressable stand-in for the emulator's memory + register file. */
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
    this.writeMemory(addr, (value >>> 24) & 0xff);
    this.writeMemory(addr + 1, (value >>> 16) & 0xff);
    this.writeMemory(addr + 2, (value >>> 8) & 0xff);
    this.writeMemory(addr + 3, value & 0xff);
  }
  writeMemoryBuffer(addr: number, data: Buffer): void {
    for (let i = 0; i < data.length; i += 1) this.writeMemory(addr + i, data[i]);
  }
  readLong(): number { return 0; }
  readString(addr: number, maxLen = 512): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
  writeString(addr: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) this.writeMemory(addr + i, text.charCodeAt(i) & 0xff);
    this.writeMemory(addr + text.length, 0);
  }
}

describe("a door's own Open() gets the 40-column copy of a header", () => {
  const NAME_ADDR = 0x1000;
  const BUFFER_ADDR = 0x4000;

  let root: string;
  let confDir: string;
  let emulator: StubEmulator;
  let dos: DosLibrary;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-40col-'));
    confDir = path.join(root, 'Conf1');
    fs.mkdirSync(confDir, { recursive: true });
    // ctop's real pair: the file it asks for, and the narrow copy beside it.
    fs.writeFileSync(path.join(confDir, 'Conftop.header'), `${WIDE}\n`, 'latin1');
    fs.writeFileSync(path.join(confDir, 'Conftop.header_C64'), `${NARROW}\n`, 'latin1');
    // A file with no narrow copy at all.
    fs.writeFileSync(path.join(confDir, 'Conftop.tailer'), `${WIDE}\n`, 'latin1');

    emulator = new StubEmulator();
    dos = new DosLibrary(emulator as any, root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Open the file the way a door does, then read what it got back. */
  function openAndRead(amigaName: string, mode = MODE_OLDFILE): string {
    emulator.writeString(NAME_ADDR, amigaName);
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, mode);
    const handle = dos.Open();
    expect(handle).toBeGreaterThan(0);

    emulator.setRegister(CPURegister.D1, handle);
    emulator.setRegister(CPURegister.D2, BUFFER_ADDR);
    emulator.setRegister(CPURegister.D3, 256);
    const read = dos.Read();
    expect(read).toBeGreaterThan(0);
    return emulator.readString(BUFFER_ADDR);
  }

  const onFortyColumns = () => dos.setNarrowArtProvider(() => true);
  const onEightyColumns = () => dos.setNarrowArtProvider(() => false);

  test('the 40-column caller reads the narrow copy', () => {
    onFortyColumns();
    expect(openAndRead(path.join(confDir, 'Conftop.header'))).toContain(NARROW);
  });

  test("an 80-column caller reads the door's own file", () => {
    onEightyColumns();
    expect(openAndRead(path.join(confDir, 'Conftop.header'))).toContain(WIDE);
  });

  test('with nobody wired at all, nothing changes', () => {
    expect(openAndRead(path.join(confDir, 'Conftop.header'))).toContain(WIDE);
  });

  test("no narrow copy drawn: the 40-column caller reads the door's own file", () => {
    onFortyColumns();
    expect(openAndRead(path.join(confDir, 'Conftop.tailer'))).toContain(WIDE);
  });

  /**
   * The guard that keeps this from being dangerous. A door opening a data file
   * for WRITING must land on the name it asked for, even when a `_C64` file
   * happens to sit beside it - otherwise the door's next save overwrites the
   * sysop's art.
   */
  test('a write is never redirected onto the narrow copy', () => {
    onFortyColumns();
    const target = path.join(confDir, 'Conftop.header');
    emulator.writeString(NAME_ADDR, target);
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, MODE_NEWFILE);
    const handle = dos.Open();
    expect(handle).toBeGreaterThan(0);
    dos.Close?.();
    // The narrow copy is untouched; the door's own file is the one truncated.
    expect(fs.readFileSync(path.join(confDir, 'Conftop.header_C64'), 'latin1')).toContain(NARROW);
  });
});
