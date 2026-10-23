/**
 * A trap jump (OpenLibrary calling an added library's Open vector, or
 * InitResident running rt_Init) must hand the caller back its own A6.
 *
 * Under the Kickstart 3.1 A1200 ROM the dos.library init does
 * `jsr OpenLibrary(a6)` then `jsr CloseLibrary(a6)`. The trap jumped into
 * dos LIB_OPEN with A6 = dos base and returned straight to the caller, so
 * CloseLibrary went through dos.library's jump table, wrote garbage over
 * ExecBase at address 4 and looped in zeroed RAM (pc=0x7a414, A6=0x6c07884e).
 * Real exec saves A6 around the Open call; the jump now returns through a
 * MOVEA.L (SP)+,A6; RTS stub.
 */
import { enterTrapJump } from '../../src/amiga-emulation/api/trap-jump';
import { RESTORE_A6_STUB_ADDR } from '../../src/amiga-emulation/memory-map';

const REG_D0 = 0;
const REG_A6 = 14;
const REG_SP = 15;
const REG_PC = 16;

const EXEC_BASE = 0x80000;
const DOS_BASE = 0x123c0c;
const DOS_OPEN = DOS_BASE - 6;
const CALLER_RETURN = 0xf9fc4c;

function fakeCpu() {
  const regs = new Map<number, number>();
  const mem16 = new Map<number, number>();
  const mem32 = new Map<number, number>();
  return {
    regs,
    mem16,
    mem32,
    getRegister: (r: number) => regs.get(r) ?? 0,
    setRegister: (r: number, v: number) => void regs.set(r, v >>> 0),
    writeMemory16: (a: number, v: number) => void mem16.set(a, v),
    writeMemory32: (a: number, v: number) => void mem32.set(a, v >>> 0),
    refillPrefetch: jest.fn(),
    pop32(): number {
      const sp = regs.get(REG_SP)!;
      regs.set(REG_SP, sp + 4);
      return mem32.get(sp) ?? 0;
    },
  };
}

describe('exec trap jump', () => {
  it('enters the library with A6 = base and returns to the caller with its own A6', () => {
    const cpu = fakeCpu();
    cpu.setRegister(REG_A6, EXEC_BASE);
    cpu.setRegister(REG_SP, 0x200810);

    enterTrapJump(cpu, DOS_OPEN, { d0: 37, a6: DOS_BASE }, CALLER_RETURN);

    expect(cpu.getRegister(REG_PC)).toBe(DOS_OPEN);
    expect(cpu.getRegister(REG_A6)).toBe(DOS_BASE);
    expect(cpu.getRegister(REG_D0)).toBe(37);
    expect(cpu.refillPrefetch).toHaveBeenCalled();
    expect(cpu.mem16.get(RESTORE_A6_STUB_ADDR)).toBe(0x2c5f);
    expect(cpu.mem16.get(RESTORE_A6_STUB_ADDR + 2)).toBe(0x4e75);

    // The library Open vector returns with RTS:
    cpu.setRegister(REG_PC, cpu.pop32());
    expect(cpu.getRegister(REG_PC)).toBe(RESTORE_A6_STUB_ADDR);
    // Stub: MOVEA.L (SP)+,A6; RTS
    cpu.setRegister(REG_A6, cpu.pop32());
    cpu.setRegister(REG_PC, cpu.pop32());

    expect(cpu.getRegister(REG_PC)).toBe(CALLER_RETURN);
    expect(cpu.getRegister(REG_A6)).toBe(EXEC_BASE);
    expect(cpu.getRegister(REG_SP)).toBe(0x200810);
  });
});
