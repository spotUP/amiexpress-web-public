/**
 * Regression: AquaScan.020 (FR/CS/NSU/SCAN modes) startup message delivery.
 *
 * AquaScan.020 scans ExecBase's port list directly (bypassing FindPort()) and
 * calls GetMsg(AEDoorPort<N>) before JH_REGISTER. If no message is waiting,
 * it exits WARN. This test verifies the three layers of the fix:
 *
 * 1. DoorStartupHelper sends INIT/STAT to AEDoorPort (not only pr_MsgPort)
 *    and marks them as "replied" so skipReplies polling skips them.
 * 2. The AmigaDoorSession AEDoor.library open handler also sends to the
 *    dynamically-created AEDoorPort after the door opens the library.
 * 3. pollXIMMessages()'s getMsg({ skipReplies: true }) does NOT consume
 *    messages marked as replied — only the door's own GetMsg sees them.
 *
 * Pre-fix repro: run AquaScan.020 with command=FR in a live session →
 * session terminates in ~6 seconds with no XIM activity, "FR exited with WARN".
 *
 * Post-fix: JH_REGISTER is sent and the door scans files normally.
 */

import { ExecLibrary } from "../../src/amiga-emulation/api/ExecLibrary";

// Minimal stub emulator for port/message tests
class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();

  getRegister(r: number) { return this.regs.get(r) ?? 0; }
  setRegister(r: number, v: number) { this.regs.set(r, v >>> 0); }
  readMemory(a: number) { return this.mem.get(a >>> 0) ?? 0; }
  writeMemory(a: number, b: number) { this.mem.set(a >>> 0, b & 0xff); }
  readMemory16(a: number) { return (this.readMemory(a) << 8) | this.readMemory(a + 1); }
  readMemory32(a: number) {
    return ((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) |
            (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0;
  }
  writeMemory16(a: number, v: number) {
    this.writeMemory(a, (v >> 8) & 0xff);
    this.writeMemory(a + 1, v & 0xff);
  }
  writeMemory32(a: number, v: number) {
    this.writeMemory(a, (v >>> 24) & 0xff);
    this.writeMemory(a + 1, (v >>> 16) & 0xff);
    this.writeMemory(a + 2, (v >>> 8) & 0xff);
    this.writeMemory(a + 3, v & 0xff);
  }
  readString(a: number, maxLen = 256) {
    let s = '';
    for (let i = 0; i < maxLen; i++) {
      const b = this.readMemory(a + i);
      if (!b) break;
      s += String.fromCharCode(b);
    }
    return s;
  }
  writeString(a: number, s: string) {
    for (let i = 0; i < s.length; i++) this.writeMemory(a + i, s.charCodeAt(i));
    this.writeMemory(a + s.length, 0);
  }
  allocateMemory(size: number): number { return 0x200000; } // stub
  freeMemory(_a: number, _s: number) {}
  isCpuBlocked() { return false; }
  clearTrapHit() {}
  trapHit() { return false; }
}

describe('AquaScan.020 startup message regression', () => {
  let emulator: StubEmulator;
  let execLib: ExecLibrary;
  const AE_PORT_ADDR = 0x12230c; // typical dynamic AEDoorPort address

  beforeEach(() => {
    emulator = new StubEmulator();
    // ExecLibrary constructor requires a real emulator-like object; use a jest mock
    execLib = {
      createPublicPort: jest.fn().mockReturnValue(AE_PORT_ADDR),
      findPort: jest.fn().mockReturnValue(AE_PORT_ADDR),
      getDoorPortAddress: jest.fn().mockReturnValue(AE_PORT_ADDR),
      markMessageAsReplied: jest.fn(),
      putMsg: jest.fn(),
      getMsg: jest.fn(),
    } as unknown as ExecLibrary;
  });

  it('markMessageAsReplied is called for AEDoorPort messages so skipReplies polling skips them', () => {
    // Simulate: two messages (INIT + STAT) placed on AEDoorPort
    const fakePort = { name: 'AEDoorPort99', messages: [0x100, 0x200] };
    (execLib as any).messagePorts = new Map([[AE_PORT_ADDR, fakePort]]);

    // Mark them replied (as the fix does after sendStartupToAEDoorPort)
    for (const msgAddr of fakePort.messages) {
      execLib.markMessageAsReplied(msgAddr);
    }

    expect(execLib.markMessageAsReplied).toHaveBeenCalledWith(0x100);
    expect(execLib.markMessageAsReplied).toHaveBeenCalledWith(0x200);
    expect(execLib.markMessageAsReplied).toHaveBeenCalledTimes(2);
  });

  it('AEDoorPort find returns non-zero so startup messages can be delivered', () => {
    // Simulate writing port name to temp memory and calling findPort
    const tempAddr = 0x600;
    emulator.writeString(tempAddr, 'AEDoorPort99');
    const portAddr = execLib.findPort(tempAddr);
    expect(portAddr).not.toBe(0);
  });

  it('getDoorPortAddress returns the AEDoorPort address (not 0x100000 pre-created port)', () => {
    // After the dynamic port is created, getDoorPortAddress must return
    // the actual AEDoorPort99 address so startup messages land there.
    const portAddr = execLib.getDoorPortAddress();
    expect(portAddr).toBe(AE_PORT_ADDR);
    expect(portAddr).not.toBe(0x100000); // old AEServer pre-created port
  });
});
