/**
 * Regression: the JH_REGISTER "TLP2 BSS patch" must only touch TLP2.
 *
 * handleRegister() writes the reply's lineLen (9999 for a logged-on user) to
 * A4+0x3022, the slot TLP2 compares its line counter against. It did that for
 * EVERY door. In the C MENU door A4 is an ordinary register (0x2468 at
 * JH_REGISTER), and A4+0x3022 = 0x548a is inside its own ae_delay_ticks():
 * `move.l 12(sp),d2` became `move.l 0(sp),d2`, every Delay(3) turned into a
 * Delay of the caller's key code (1000/1001 ticks = 20 s), and the menu froze
 * for ~20 s after each key (measured 2026-10-15, harness + live).
 *
 * The patch now runs only when the running door's seglist contains TLP2's
 * pause compare `cmp.l $3022(a4),d0` (0xb0ac 0x3022).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  XIMSystemCommandsHandler,
  segListContainsLong,
  TLP2_PAUSE_COMPARE,
} from '../../src/amiga-emulation/xim/system-commands';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { BBSSessionData, XIMState } from '../../src/amiga-emulation/xim/types';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { HunkLoader } from '../../src/amiga-emulation/loader/HunkLoader';

const MEM_SIZE = 0x100000;

class StubEmulator {
  readonly mem = new Uint8Array(MEM_SIZE);
  a4 = 0;

  readMemory(address: number): number {
    return this.mem[address] ?? 0;
  }
  writeMemory(address: number, byte: number): void {
    this.mem[address] = byte & 0xff;
  }
  readMemory16(address: number): number {
    return (this.readMemory(address) << 8) | this.readMemory(address + 1);
  }
  writeMemory16(address: number, value: number): void {
    this.writeMemory(address, value >> 8);
    this.writeMemory(address + 1, value);
  }
  readMemory32(address: number): number {
    return ((this.readMemory16(address) << 16) | this.readMemory16(address + 2)) >>> 0;
  }
  writeMemory32(address: number, value: number): void {
    this.writeMemory16(address, (value >>> 16) & 0xffff);
    this.writeMemory16(address + 2, value & 0xffff);
  }
  readString(address: number, maxLength: number): string {
    let out = '';
    for (let i = 0; i < maxLength; i++) {
      const b = this.readMemory(address + i);
      if (b === 0) break;
      out += String.fromCharCode(b);
    }
    return out;
  }
  getRegister(idx: number): number {
    return idx === 12 ? this.a4 : 0;
  }
}

const TASK_ADDR = 0x800;
const MSG_ADDR = 0x1000;
const SEG_HEADER = 0x2000; // one code segment: data at 0x2008

/** One code segment in the HunkLoader layout, pr_SegList pointing at it. */
function loadOneSegment(emu: StubEmulator, code: number[]): void {
  const bytes = Math.ceil(code.length / 4) * 4;
  emu.writeMemory32(SEG_HEADER, bytes / 4);
  emu.writeMemory32(SEG_HEADER + 4, 0);
  code.forEach((b, i) => emu.writeMemory(SEG_HEADER + 8 + i, b));
  emu.writeMemory32(TASK_ADDR + 0x80, SEG_HEADER >>> 2);
}

function register(emu: StubEmulator): void {
  emu.writeMemory16(MSG_ADDR + DoorConstants.MESSAGE_LENGTH_OFFSET, 0x150);
  const parser = new XIMMessageParser(emu as any);
  const bbsSession: BBSSessionData = { user: { username: 'Caller' } as any, nodeId: 1 };
  const state = { registered: false, lineCount: 0 } as unknown as XIMState;
  const execLibrary = { replyMsg: jest.fn(), getCurrentTaskAddress: () => TASK_ADDR } as any;
  const handler = new XIMSystemCommandsHandler(
    emu as any, execLibrary, { emit: jest.fn() } as any, parser, bbsSession, state
  );
  handler.handleRegister(parser.parseMessage(MSG_ADDR) as any);
}

// The MENU door's ae_delay_ticks() as it is linked (code offset 0x347c):
//   moveml d2/a6,-(sp); move.l 12(sp),d2; ble.s; move.l d2,d1; ...
const AE_DELAY_TICKS = [0x48, 0xe7, 0x20, 0x02, 0x24, 0x2f, 0x00, 0x0c, 0x6f, 0x0c, 0x22, 0x02];

describe('JH_REGISTER TLP2 BSS patch stays out of other doors', () => {
  it('does not overwrite the code of a door that never reads $3022(a4) (MENU door Delay freeze)', () => {
    const emu = new StubEmulator();
    loadOneSegment(emu, AE_DELAY_TICKS);
    // A4 such that A4+0x3022 lands on `move.l 12(sp),d2`'s displacement word.
    emu.a4 = SEG_HEADER + 8 + 6 - 0x3022 + 0x10000;
    const target = emu.a4 + 0x3022;
    // Same bytes at the target, so the assertion is about the write, not the layout.
    AE_DELAY_TICKS.forEach((b, i) => emu.writeMemory(target - 6 + i, b));
    const before = emu.readMemory32(target);

    register(emu);

    expect(emu.readMemory32(target)).toBe(before);
    expect(emu.readMemory32(MSG_ADDR + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(9999);
  });

  it('still writes lineLen to $3022(a4) for a door whose code has the TLP2 pause compare', () => {
    const emu = new StubEmulator();
    // cmp.l $3022(a4),d0 ; bne.s
    loadOneSegment(emu, [0x4e, 0x71, 0xb0, 0xac, 0x30, 0x22, 0x66, 0x04]);
    emu.a4 = 0x40000;

    register(emu);

    expect(emu.readMemory32(emu.a4 + 0x3022)).toBe(9999);
  });
});

describe('segListContainsLong on the real door binaries', () => {
  const repo = path.resolve(__dirname, '../../../..');
  function seglistOf(file: string): { emu: StubEmulator; bptr: number } {
    const emu = new StubEmulator();
    const hunks = new HunkLoader().parse(fs.readFileSync(path.join(repo, file)), 0x2000);
    new HunkLoader().load(emu as any, hunks);
    return { emu, bptr: hunks.segments[0].bptr };
  }

  it('finds the compare in TLP2 and not in the MENU door', () => {
    const tlp2 = seglistOf('Doors/SRH/TList/TLP2');
    const menu = seglistOf('Doors/MAINMENU/mainmenu');
    expect(segListContainsLong(tlp2.emu, tlp2.bptr, TLP2_PAUSE_COMPARE)).toBe(true);
    expect(segListContainsLong(menu.emu, menu.bptr, TLP2_PAUSE_COMPARE)).toBe(false);
  });
});
